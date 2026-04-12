
-- Create enums
CREATE TYPE public.app_role AS ENUM ('admin', 'coach', 'player', 'parent');
CREATE TYPE public.event_type AS ENUM ('practice', 'match', 'tryout');
CREATE TYPE public.invoice_status AS ENUM ('unpaid', 'partial', 'paid');
CREATE TYPE public.rsvp_status AS ENUM ('attending', 'not_attending', 'maybe');
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent');
CREATE TYPE public.registration_status AS ENUM ('pending', 'approved', 'rejected');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table (separate as required)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get user role function
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Teams
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  age_group TEXT,
  division TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Team coaches
CREATE TABLE public.team_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  coach_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(team_id, coach_user_id)
);
ALTER TABLE public.team_coaches ENABLE ROW LEVEL SECURITY;

-- Team players
CREATE TABLE public.team_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(team_id, player_user_id)
);
ALTER TABLE public.team_players ENABLE ROW LEVEL SECURITY;

-- Parent-child links
CREATE TABLE public.parent_child_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(parent_user_id, child_user_id)
);
ALTER TABLE public.parent_child_links ENABLE ROW LEVEL SECURITY;

-- Events
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  event_type event_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location_or_court TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Registration forms
CREATE TABLE public.registration_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  related_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.registration_forms ENABLE ROW LEVEL SECURITY;

-- Registrations
CREATE TABLE public.registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_form_id UUID NOT NULL REFERENCES public.registration_forms(id) ON DELETE CASCADE,
  player_user_id UUID NOT NULL REFERENCES auth.users(id),
  parent_user_id UUID NOT NULL REFERENCES auth.users(id),
  status registration_status NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Waiver files
CREATE TABLE public.waiver_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.waiver_files ENABLE ROW LEVEL SECURITY;

-- Invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES public.registrations(id) ON DELETE SET NULL,
  parent_user_id UUID NOT NULL REFERENCES auth.users(id),
  player_user_id UUID NOT NULL REFERENCES auth.users(id),
  amount_total NUMERIC(10,2) NOT NULL,
  amount_due NUMERIC(10,2) NOT NULL,
  due_date DATE NOT NULL,
  status invoice_status NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RSVPs
CREATE TABLE public.rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_user_id UUID NOT NULL REFERENCES auth.users(id),
  responded_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  status rsvp_status NOT NULL DEFAULT 'maybe',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, player_user_id)
);
ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;

-- Attendance records
CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_user_id UUID NOT NULL REFERENCES auth.users(id),
  marked_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  status attendance_status NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, player_user_id)
);
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

-- Announcements
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Conflict detection function for events
CREATE OR REPLACE FUNCTION public.check_event_conflicts(
  p_team_id UUID,
  p_location TEXT,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_exclude_event_id UUID DEFAULT NULL
)
RETURNS TABLE(conflict_type TEXT, conflict_detail TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check same team overlap
  RETURN QUERY
  SELECT 'team'::TEXT, ('Team already has event: ' || e.title)::TEXT
  FROM public.events e
  WHERE e.team_id = p_team_id
    AND (p_exclude_event_id IS NULL OR e.id != p_exclude_event_id)
    AND e.start_time < p_end_time
    AND e.end_time > p_start_time;

  -- Check same location overlap
  RETURN QUERY
  SELECT 'location'::TEXT, ('Location conflict with: ' || e.title)::TEXT
  FROM public.events e
  WHERE e.location_or_court = p_location
    AND p_location IS NOT NULL AND p_location != ''
    AND (p_exclude_event_id IS NULL OR e.id != p_exclude_event_id)
    AND e.start_time < p_end_time
    AND e.end_time > p_start_time;

  -- Check coach overlap
  RETURN QUERY
  SELECT 'coach'::TEXT, ('Coach has conflict with: ' || e.title)::TEXT
  FROM public.events e
  JOIN public.team_coaches tc1 ON tc1.team_id = e.team_id
  JOIN public.team_coaches tc2 ON tc2.team_id = p_team_id AND tc2.coach_user_id = tc1.coach_user_id
  WHERE (p_exclude_event_id IS NULL OR e.id != p_exclude_event_id)
    AND e.start_time < p_end_time
    AND e.end_time > p_start_time
    AND e.team_id != p_team_id;
END;
$$;

-- Auto-generate invoice after registration
CREATE OR REPLACE FUNCTION public.auto_generate_invoice()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.invoices (registration_id, parent_user_id, player_user_id, amount_total, amount_due, due_date, status)
  VALUES (NEW.id, NEW.parent_user_id, NEW.player_user_id, 150.00, 150.00, (now() + interval '30 days')::date, 'unpaid');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_registration_created
  AFTER INSERT ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.auto_generate_invoice();

-- ============= RLS POLICIES =============

-- Profiles
CREATE POLICY "Anyone authenticated can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR auth.uid() = id);

-- User roles
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Teams
CREATE POLICY "Authenticated users can view teams" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage teams" ON public.teams FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update teams" ON public.teams FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete teams" ON public.teams FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Team coaches
CREATE POLICY "Authenticated can view team coaches" ON public.team_coaches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage team coaches" ON public.team_coaches FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete team coaches" ON public.team_coaches FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Team players
CREATE POLICY "Authenticated can view team players" ON public.team_players FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage team players" ON public.team_players FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete team players" ON public.team_players FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Parent child links
CREATE POLICY "Admins and involved users can view links" ON public.parent_child_links FOR SELECT TO authenticated USING (parent_user_id = auth.uid() OR child_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage links" ON public.parent_child_links FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete links" ON public.parent_child_links FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Events
CREATE POLICY "Team members and coaches can view events" ON public.events FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.team_coaches WHERE team_id = events.team_id AND coach_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.team_players WHERE team_id = events.team_id AND player_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.parent_child_links pcl JOIN public.team_players tp ON tp.player_user_id = pcl.child_user_id WHERE pcl.parent_user_id = auth.uid() AND tp.team_id = events.team_id)
);
CREATE POLICY "Coaches can create events for assigned teams" ON public.events FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR (public.has_role(auth.uid(), 'coach') AND EXISTS (SELECT 1 FROM public.team_coaches WHERE team_id = events.team_id AND coach_user_id = auth.uid()))
);
CREATE POLICY "Coaches can update own team events" ON public.events FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR (public.has_role(auth.uid(), 'coach') AND EXISTS (SELECT 1 FROM public.team_coaches WHERE team_id = events.team_id AND coach_user_id = auth.uid()))
);
CREATE POLICY "Admins can delete events" ON public.events FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Registration forms
CREATE POLICY "Active forms visible to authenticated" ON public.registration_forms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage forms" ON public.registration_forms FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update forms" ON public.registration_forms FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Registrations
CREATE POLICY "Admins and involved users can view registrations" ON public.registrations FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR parent_user_id = auth.uid() OR player_user_id = auth.uid()
);
CREATE POLICY "Parents can submit registrations" ON public.registrations FOR INSERT TO authenticated WITH CHECK (
  parent_user_id = auth.uid() AND public.has_role(auth.uid(), 'parent')
);

-- Waiver files
CREATE POLICY "Admins and involved can view waivers" ON public.waiver_files FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = waiver_files.registration_id AND (r.parent_user_id = auth.uid() OR r.player_user_id = auth.uid()))
);
CREATE POLICY "Parents can upload waivers" ON public.waiver_files FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = waiver_files.registration_id AND r.parent_user_id = auth.uid())
);

-- Invoices
CREATE POLICY "Admins and parents can view invoices" ON public.invoices FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR parent_user_id = auth.uid()
);
CREATE POLICY "System can create invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RSVPs
CREATE POLICY "Team members can view RSVPs" ON public.rsvps FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR player_user_id = auth.uid()
  OR responded_by_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.events e JOIN public.team_coaches tc ON tc.team_id = e.team_id WHERE e.id = rsvps.event_id AND tc.coach_user_id = auth.uid())
);
CREATE POLICY "Players and parents can RSVP" ON public.rsvps FOR INSERT TO authenticated WITH CHECK (
  player_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.parent_child_links WHERE parent_user_id = auth.uid() AND child_user_id = rsvps.player_user_id)
);
CREATE POLICY "Players and parents can update RSVP" ON public.rsvps FOR UPDATE TO authenticated USING (
  player_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.parent_child_links WHERE parent_user_id = auth.uid() AND child_user_id = rsvps.player_user_id)
);

-- Attendance records
CREATE POLICY "Coaches and admins can view attendance" ON public.attendance_records FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR player_user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.events e JOIN public.team_coaches tc ON tc.team_id = e.team_id WHERE e.id = attendance_records.event_id AND tc.coach_user_id = auth.uid())
);
CREATE POLICY "Coaches can mark attendance" ON public.attendance_records FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'coach')
  AND EXISTS (SELECT 1 FROM public.events e JOIN public.team_coaches tc ON tc.team_id = e.team_id WHERE e.id = attendance_records.event_id AND tc.coach_user_id = auth.uid())
);
CREATE POLICY "Coaches can update attendance" ON public.attendance_records FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'coach')
  AND EXISTS (SELECT 1 FROM public.events e JOIN public.team_coaches tc ON tc.team_id = e.team_id WHERE e.id = attendance_records.event_id AND tc.coach_user_id = auth.uid())
);

-- Announcements
CREATE POLICY "Team members can view announcements" ON public.announcements FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.team_coaches WHERE team_id = announcements.team_id AND coach_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.team_players WHERE team_id = announcements.team_id AND player_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.parent_child_links pcl JOIN public.team_players tp ON tp.player_user_id = pcl.child_user_id WHERE pcl.parent_user_id = auth.uid() AND tp.team_id = announcements.team_id)
);
CREATE POLICY "Coaches can create announcements" ON public.announcements FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR (public.has_role(auth.uid(), 'coach') AND EXISTS (SELECT 1 FROM public.team_coaches WHERE team_id = announcements.team_id AND coach_user_id = auth.uid()))
);

-- Notifications
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'coach')
);

-- Storage bucket for waivers
INSERT INTO storage.buckets (id, name, public) VALUES ('waivers', 'waivers', false);

CREATE POLICY "Parents can upload waivers" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'waivers');
CREATE POLICY "Authenticated users can view waivers" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'waivers');

-- Indexes
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_team_coaches_team_id ON public.team_coaches(team_id);
CREATE INDEX idx_team_coaches_coach_id ON public.team_coaches(coach_user_id);
CREATE INDEX idx_team_players_team_id ON public.team_players(team_id);
CREATE INDEX idx_team_players_player_id ON public.team_players(player_user_id);
CREATE INDEX idx_events_team_id ON public.events(team_id);
CREATE INDEX idx_events_start_time ON public.events(start_time);
CREATE INDEX idx_parent_child_parent ON public.parent_child_links(parent_user_id);
CREATE INDEX idx_parent_child_child ON public.parent_child_links(child_user_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id) WHERE NOT is_read;
CREATE INDEX idx_invoices_parent ON public.invoices(parent_user_id);
CREATE INDEX idx_rsvps_event ON public.rsvps(event_id);
CREATE INDEX idx_attendance_event ON public.attendance_records(event_id);
CREATE INDEX idx_announcements_team ON public.announcements(team_id);
