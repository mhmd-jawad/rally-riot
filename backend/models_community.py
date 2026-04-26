"""Community Hub models — posts, replies, polls, votes."""
from datetime import datetime
from extensions import db


class CommunityPost(db.Model):
    __tablename__ = "community_posts"
    __table_args__ = (
        db.Index("idx_post_team", "team_id"),
        db.Index("idx_post_author", "author_user_id"),
    )
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    team_id = db.Column(db.Integer, db.ForeignKey("teams.id"), nullable=False)
    author_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    title = db.Column(db.String, nullable=False)
    body = db.Column(db.Text, nullable=False)
    category = db.Column(db.String, default="general")  # general, question, tip, poll
    is_pinned = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    author = db.relationship("User", foreign_keys=[author_user_id])
    team = db.relationship("Team", foreign_keys=[team_id])
    replies = db.relationship("CommunityReply", backref="post", lazy="dynamic",
                              cascade="all, delete-orphan")
    poll = db.relationship("CommunityPoll", uselist=False, backref="post",
                           cascade="all, delete-orphan")

    def to_dict(self, include_replies=False, include_poll=False, current_user_id=None):
        d = {
            "id": self.id,
            "team_id": self.team_id,
            "team": {"id": self.team.id, "name": self.team.name} if self.team else None,
            "author_user_id": self.author_user_id,
            "author": {"id": self.author.id, "full_name": self.author.full_name,
                       "role": self.author.role} if self.author else None,
            "title": self.title,
            "body": self.body,
            "category": self.category,
            "is_pinned": self.is_pinned,
            "reply_count": self.replies.count(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_replies:
            d["replies"] = [r.to_dict() for r in
                            self.replies.order_by(CommunityReply.created_at.asc()).all()]
        if include_poll and self.poll:
            d["poll"] = self.poll.to_dict(current_user_id=current_user_id)
        elif include_poll:
            d["poll"] = None
        return d


class CommunityReply(db.Model):
    __tablename__ = "community_replies"
    __table_args__ = (
        db.Index("idx_reply_post", "post_id"),
    )
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    post_id = db.Column(db.Integer, db.ForeignKey("community_posts.id"), nullable=False)
    author_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    author = db.relationship("User", foreign_keys=[author_user_id])

    def to_dict(self):
        return {
            "id": self.id,
            "post_id": self.post_id,
            "author_user_id": self.author_user_id,
            "author": {"id": self.author.id, "full_name": self.author.full_name,
                       "role": self.author.role} if self.author else None,
            "body": self.body,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CommunityPoll(db.Model):
    __tablename__ = "community_polls"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    post_id = db.Column(db.Integer, db.ForeignKey("community_posts.id"), nullable=False)
    question = db.Column(db.String, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    options = db.relationship("CommunityPollOption", backref="poll", lazy="dynamic",
                              cascade="all, delete-orphan",
                              order_by="CommunityPollOption.id")

    def to_dict(self, current_user_id=None):
        opts = self.options.all()
        total_votes = sum(o.votes.count() for o in opts)
        user_vote_option_id = None
        if current_user_id:
            for o in opts:
                if o.votes.filter_by(user_id=current_user_id).first():
                    user_vote_option_id = o.id
                    break
        return {
            "id": self.id,
            "post_id": self.post_id,
            "question": self.question,
            "total_votes": total_votes,
            "user_vote_option_id": user_vote_option_id,
            "options": [o.to_dict() for o in opts],
        }


class CommunityPollOption(db.Model):
    __tablename__ = "community_poll_options"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    poll_id = db.Column(db.Integer, db.ForeignKey("community_polls.id"), nullable=False)
    label = db.Column(db.String, nullable=False)

    votes = db.relationship("CommunityPollVote", backref="option", lazy="dynamic",
                            cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "poll_id": self.poll_id,
            "label": self.label,
            "vote_count": self.votes.count(),
        }


class CommunityPollVote(db.Model):
    __tablename__ = "community_poll_votes"
    __table_args__ = (
        db.UniqueConstraint("poll_id", "user_id"),
    )
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    poll_id = db.Column(db.Integer, db.ForeignKey("community_polls.id"), nullable=False)
    option_id = db.Column(db.Integer, db.ForeignKey("community_poll_options.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    voted_at = db.Column(db.DateTime, default=datetime.utcnow)
