import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const users = [
      { email: "admin@rallyriot.demo", password: "demo1234", name: "Alex Admin", role: "admin" },
      { email: "coach1@rallyriot.demo", password: "demo1234", name: "Chris Coach", role: "coach" },
      { email: "coach2@rallyriot.demo", password: "demo1234", name: "Casey Coach", role: "coach" },
      { email: "player1@rallyriot.demo", password: "demo1234", name: "Pat Player", role: "player" },
      { email: "player2@rallyriot.demo", password: "demo1234", name: "Sam Spiker", role: "player" },
      { email: "player3@rallyriot.demo", password: "demo1234", name: "Jordan Jump", role: "player" },
      { email: "player4@rallyriot.demo", password: "demo1234", name: "Riley Rally", role: "player" },
      { email: "parent1@rallyriot.demo", password: "demo1234", name: "Morgan Mom", role: "parent" },
      { email: "parent2@rallyriot.demo", password: "demo1234", name: "Dana Dad", role: "parent" },
      { email: "parent3@rallyriot.demo", password: "demo1234", name: "Taylor Parent", role: "parent" },
      { email: "parent4@rallyriot.demo", password: "demo1234", name: "Jamie Guardian", role: "parent" },
    ];

    const userIds: Record<string, string> = {};

    for (const u of users) {
      // Check if exists
      const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
      const found = existing?.users?.find((x: any) => x.email === u.email);
      if (found) {
        userIds[u.email] = found.id;
        continue;
      }
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.name },
      });
      if (error) throw new Error(`Failed to create ${u.email}: ${error.message}`);
      userIds[u.email] = data.user.id;
    }

    // Assign roles
    for (const u of users) {
      await supabaseAdmin.from("user_roles").upsert(
        { user_id: userIds[u.email], role: u.role },
        { onConflict: "user_id,role" }
      );
    }

    // Update profile names
    for (const u of users) {
      await supabaseAdmin.from("profiles").update({ full_name: u.name }).eq("id", userIds[u.email]);
    }

    // Create teams
    const { data: t1 } = await supabaseAdmin.from("teams").upsert(
      { name: "Thunder U16", age_group: "U16", division: "Division A" },
      { onConflict: "name" as any }
    ).select().single();
    const { data: t2 } = await supabaseAdmin.from("teams").upsert(
      { name: "Lightning U18", age_group: "U18", division: "Division A" },
      { onConflict: "name" as any }
    ).select().single();

    // Fallback: query teams if upsert didn't return
    let team1Id = t1?.id, team2Id = t2?.id;
    if (!team1Id) {
      const { data } = await supabaseAdmin.from("teams").select("id").eq("name", "Thunder U16").single();
      team1Id = data?.id;
    }
    if (!team2Id) {
      const { data } = await supabaseAdmin.from("teams").select("id").eq("name", "Lightning U18").single();
      team2Id = data?.id;
    }
    if (!team1Id || !team2Id) {
      // Create fresh
      if (!team1Id) { const { data } = await supabaseAdmin.from("teams").insert({ name: "Thunder U16", age_group: "U16", division: "Division A" }).select().single(); team1Id = data?.id; }
      if (!team2Id) { const { data } = await supabaseAdmin.from("teams").insert({ name: "Lightning U18", age_group: "U18", division: "Division A" }).select().single(); team2Id = data?.id; }
    }

    // Assign coaches
    await supabaseAdmin.from("team_coaches").upsert({ team_id: team1Id, coach_user_id: userIds["coach1@rallyriot.demo"] }, { onConflict: "team_id,coach_user_id" });
    await supabaseAdmin.from("team_coaches").upsert({ team_id: team2Id, coach_user_id: userIds["coach2@rallyriot.demo"] }, { onConflict: "team_id,coach_user_id" });

    // Assign players
    await supabaseAdmin.from("team_players").upsert({ team_id: team1Id, player_user_id: userIds["player1@rallyriot.demo"] }, { onConflict: "team_id,player_user_id" });
    await supabaseAdmin.from("team_players").upsert({ team_id: team1Id, player_user_id: userIds["player2@rallyriot.demo"] }, { onConflict: "team_id,player_user_id" });
    await supabaseAdmin.from("team_players").upsert({ team_id: team2Id, player_user_id: userIds["player3@rallyriot.demo"] }, { onConflict: "team_id,player_user_id" });
    await supabaseAdmin.from("team_players").upsert({ team_id: team2Id, player_user_id: userIds["player4@rallyriot.demo"] }, { onConflict: "team_id,player_user_id" });

    // Parent-child links
    await supabaseAdmin.from("parent_child_links").upsert({ parent_user_id: userIds["parent1@rallyriot.demo"], child_user_id: userIds["player1@rallyriot.demo"] }, { onConflict: "parent_user_id,child_user_id" });
    await supabaseAdmin.from("parent_child_links").upsert({ parent_user_id: userIds["parent2@rallyriot.demo"], child_user_id: userIds["player2@rallyriot.demo"] }, { onConflict: "parent_user_id,child_user_id" });
    await supabaseAdmin.from("parent_child_links").upsert({ parent_user_id: userIds["parent3@rallyriot.demo"], child_user_id: userIds["player3@rallyriot.demo"] }, { onConflict: "parent_user_id,child_user_id" });
    await supabaseAdmin.from("parent_child_links").upsert({ parent_user_id: userIds["parent4@rallyriot.demo"], child_user_id: userIds["player4@rallyriot.demo"] }, { onConflict: "parent_user_id,child_user_id" });

    // Create events
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86400000);
    const nextWeek = new Date(now.getTime() + 7 * 86400000);
    
    const events = [
      { team_id: team1Id, created_by_user_id: userIds["coach1@rallyriot.demo"], event_type: "practice", title: "Morning Practice", location_or_court: "Court A", start_time: new Date(tomorrow.setHours(9, 0)).toISOString(), end_time: new Date(tomorrow.setHours(11, 0)).toISOString() },
      { team_id: team1Id, created_by_user_id: userIds["coach1@rallyriot.demo"], event_type: "match", title: "Friendly Match vs Eagles", location_or_court: "Main Gym", start_time: new Date(nextWeek.setHours(14, 0)).toISOString(), end_time: new Date(nextWeek.setHours(16, 0)).toISOString() },
      { team_id: team2Id, created_by_user_id: userIds["coach2@rallyriot.demo"], event_type: "practice", title: "Afternoon Drills", location_or_court: "Court B", start_time: new Date(tomorrow.setHours(15, 0)).toISOString(), end_time: new Date(tomorrow.setHours(17, 0)).toISOString() },
      { team_id: team2Id, created_by_user_id: userIds["coach2@rallyriot.demo"], event_type: "tryout", title: "Open Tryouts", location_or_court: "Court A", start_time: new Date(nextWeek.setHours(10, 0)).toISOString(), end_time: new Date(nextWeek.setHours(12, 0)).toISOString() },
    ];
    for (const ev of events) {
      await supabaseAdmin.from("events").insert(ev);
    }

    // Registration form
    const { data: regForm } = await supabaseAdmin.from("registration_forms").insert({
      title: "Spring 2026 Season Registration",
      description: "Register your child for the upcoming Spring 2026 volleyball season. Includes practices, matches, and tournaments.",
      related_team_id: team1Id,
      is_active: true,
      created_by_user_id: userIds["admin@rallyriot.demo"],
    }).select().single();

    // Announcements
    await supabaseAdmin.from("announcements").insert([
      { team_id: team1Id, created_by_user_id: userIds["coach1@rallyriot.demo"], title: "Welcome to the Season!", body: "Excited to kick off our Spring 2026 season. Let's make it great!" },
      { team_id: team2Id, created_by_user_id: userIds["coach2@rallyriot.demo"], title: "Schedule Update", body: "New practice times confirmed for next week. Check the calendar." },
    ]);

    // Notifications
    const playerIds = [userIds["player1@rallyriot.demo"], userIds["player2@rallyriot.demo"]];
    for (const pid of playerIds) {
      await supabaseAdmin.from("notifications").insert({
        user_id: pid, type: "announcement", title: "Welcome to the Season!", body: "Coach posted a new announcement for your team."
      });
    }
    await supabaseAdmin.from("notifications").insert({
      user_id: userIds["parent1@rallyriot.demo"], type: "announcement", title: "New Team Announcement", body: "Check the latest update from your child's coach."
    });

    return new Response(JSON.stringify({ success: true, message: "Demo data seeded!" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
