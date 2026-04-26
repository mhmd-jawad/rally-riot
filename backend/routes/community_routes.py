"""Community Hub routes — posts, replies, polls, votes, pin."""
from flask import Blueprint, request, g

import api_response
from auth import authenticate, authorize
from models_community import (
    CommunityPost, CommunityReply, CommunityPoll,
    CommunityPollOption, CommunityPollVote,
)
from models import TeamCoach, TeamPlayer, ParentChildLink
from extensions import db

community_bp = Blueprint("community", __name__)

VALID_CATEGORIES = ("general", "question", "tip", "poll")


def _visible_team_ids():
    """Return team IDs the current user can see, or None if admin (all)."""
    user_id = g.user["id"]
    role = g.user["role"]
    if role == "admin":
        return None
    if role == "coach":
        return [r.team_id for r in TeamCoach.query.filter_by(coach_user_id=user_id).all()]
    if role == "player":
        return [r.team_id for r in TeamPlayer.query.filter_by(player_user_id=user_id).all()]
    # parent — derive from children
    child_ids = [l.child_user_id for l in
                 ParentChildLink.query.filter_by(parent_user_id=user_id).all()]
    return [r.team_id for r in
            TeamPlayer.query.filter(TeamPlayer.player_user_id.in_(child_ids)).all()]


# ── Posts ──────────────────────────────────────────────────────────────────

@community_bp.route("/posts", methods=["GET"])
@authenticate
def list_posts():
    team_id = request.args.get("team_id", type=int)
    category = request.args.get("category")
    visible = _visible_team_ids()

    query = CommunityPost.query
    if visible is not None:
        if not visible:
            return api_response.success([])
        query = query.filter(CommunityPost.team_id.in_(visible))
    if team_id:
        query = query.filter_by(team_id=team_id)
    if category and category in VALID_CATEGORIES:
        query = query.filter_by(category=category)

    posts = query.order_by(
        CommunityPost.is_pinned.desc(),
        CommunityPost.created_at.desc()
    ).all()

    return api_response.success([
        p.to_dict(include_poll=True, current_user_id=g.user["id"]) for p in posts
    ])


@community_bp.route("/posts/<int:post_id>", methods=["GET"])
@authenticate
def get_post(post_id):
    post = CommunityPost.query.get(post_id)
    if not post:
        return api_response.not_found("Post not found.")
    visible = _visible_team_ids()
    if visible is not None and post.team_id not in visible:
        return api_response.forbidden("You cannot view this post.")
    return api_response.success(
        post.to_dict(include_replies=True, include_poll=True, current_user_id=g.user["id"])
    )


@community_bp.route("/posts", methods=["POST"])
@authenticate
@authorize("player", "coach", "parent", "admin")
def create_post():
    data = request.get_json(silent=True) or {}
    errors = []
    if not data.get("team_id"):
        errors.append({"field": "team_id", "message": "team_id is required."})
    if not data.get("title", "").strip():
        errors.append({"field": "title", "message": "title is required."})
    if not data.get("body", "").strip():
        errors.append({"field": "body", "message": "body is required."})
    category = data.get("category", "general")
    if category not in VALID_CATEGORIES:
        errors.append({"field": "category",
                       "message": f"category must be one of {', '.join(VALID_CATEGORIES)}."})
    if errors:
        return api_response.bad_request("Validation failed.", errors)

    visible = _visible_team_ids()
    if visible is not None and data["team_id"] not in visible:
        return api_response.forbidden("You are not a member of this team.")

    # Poll posts must include poll data
    if category == "poll":
        poll_data = data.get("poll", {})
        if not poll_data.get("question", "").strip():
            return api_response.bad_request("Poll posts require a poll question.")
        options = [o for o in poll_data.get("options", []) if str(o).strip()]
        if len(options) < 2:
            return api_response.bad_request("Polls require at least 2 options.")

    post = CommunityPost(
        team_id=data["team_id"],
        author_user_id=g.user["id"],
        title=data["title"].strip(),
        body=data["body"].strip(),
        category=category,
        is_pinned=False,
    )
    db.session.add(post)
    db.session.flush()

    if category == "poll":
        poll_data = data["poll"]
        poll = CommunityPoll(post_id=post.id, question=poll_data["question"].strip())
        db.session.add(poll)
        db.session.flush()
        for label in poll_data["options"]:
            if str(label).strip():
                db.session.add(CommunityPollOption(poll_id=poll.id, label=str(label).strip()))

    db.session.commit()
    return api_response.created(
        post.to_dict(include_poll=True, current_user_id=g.user["id"]),
        "Post created."
    )


@community_bp.route("/posts/<int:post_id>", methods=["DELETE"])
@authenticate
def delete_post(post_id):
    post = CommunityPost.query.get(post_id)
    if not post:
        return api_response.not_found("Post not found.")
    if g.user["role"] != "admin" and post.author_user_id != g.user["id"]:
        return api_response.forbidden("You can only delete your own posts.")
    db.session.delete(post)
    db.session.commit()
    return api_response.success(None, "Post deleted.")


# ── Pin (admin only) ───────────────────────────────────────────────────────

@community_bp.route("/posts/<int:post_id>/pin", methods=["PATCH"])
@authenticate
@authorize("admin")
def toggle_pin(post_id):
    post = CommunityPost.query.get(post_id)
    if not post:
        return api_response.not_found("Post not found.")
    post.is_pinned = not post.is_pinned
    db.session.commit()
    action = "pinned" if post.is_pinned else "unpinned"
    return api_response.success(
        post.to_dict(include_poll=True, current_user_id=g.user["id"]),
        f"Post {action}."
    )


# ── Replies ────────────────────────────────────────────────────────────────

@community_bp.route("/posts/<int:post_id>/replies", methods=["POST"])
@authenticate
@authorize("player", "coach", "parent", "admin")
def create_reply(post_id):
    post = CommunityPost.query.get(post_id)
    if not post:
        return api_response.not_found("Post not found.")

    visible = _visible_team_ids()
    if visible is not None and post.team_id not in visible:
        return api_response.forbidden("You are not a member of this team.")

    data = request.get_json(silent=True) or {}
    body = data.get("body", "").strip()
    if not body:
        return api_response.bad_request("Validation failed.", [
            {"field": "body", "message": "Reply body is required."}
        ])

    reply = CommunityReply(
        post_id=post_id,
        author_user_id=g.user["id"],
        body=body,
    )
    db.session.add(reply)
    db.session.commit()
    return api_response.created(reply.to_dict(), "Reply posted.")


@community_bp.route("/replies/<int:reply_id>", methods=["DELETE"])
@authenticate
def delete_reply(reply_id):
    reply = CommunityReply.query.get(reply_id)
    if not reply:
        return api_response.not_found("Reply not found.")
    if g.user["role"] != "admin" and reply.author_user_id != g.user["id"]:
        return api_response.forbidden("You can only delete your own replies.")
    db.session.delete(reply)
    db.session.commit()
    return api_response.success(None, "Reply deleted.")


# ── Poll voting ────────────────────────────────────────────────────────────

@community_bp.route("/polls/<int:poll_id>/vote", methods=["POST"])
@authenticate
@authorize("player", "coach", "parent", "admin")
def vote(poll_id):
    poll = CommunityPoll.query.get(poll_id)
    if not poll:
        return api_response.not_found("Poll not found.")

    post = CommunityPost.query.get(poll.post_id)
    visible = _visible_team_ids()
    if visible is not None and post.team_id not in visible:
        return api_response.forbidden("You are not a member of this team.")

    data = request.get_json(silent=True) or {}
    option_id = data.get("option_id")
    if not option_id:
        return api_response.bad_request("Validation failed.", [
            {"field": "option_id", "message": "option_id is required."}
        ])

    option = CommunityPollOption.query.filter_by(id=option_id, poll_id=poll_id).first()
    if not option:
        return api_response.not_found("Poll option not found.")

    existing = CommunityPollVote.query.filter_by(
        poll_id=poll_id, user_id=g.user["id"]
    ).first()

    if existing:
        # Change vote
        existing.option_id = option_id
    else:
        db.session.add(CommunityPollVote(
            poll_id=poll_id, option_id=option_id, user_id=g.user["id"]
        ))

    db.session.commit()
    return api_response.success(poll.to_dict(current_user_id=g.user["id"]), "Vote recorded.")
