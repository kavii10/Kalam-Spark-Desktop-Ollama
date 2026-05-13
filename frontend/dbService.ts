import { UserProfile, DailyTask, Reward } from './types';
import { supabase } from './supabaseClient';

// Supabase table names
const TABLES = {
  USERS: "users",
  ROADMAPS: "roadmaps",
  TASKS: "tasks",
  PROGRESS: "completed_stages",
};

// Session ID for grouping mentor messages within the same chat session
// Generated once per app load — all messages in this session share the same ID
const MENTOR_SESSION_ID = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

export { MENTOR_SESSION_ID };

const STORAGE_KEYS = {
  USER: "kalamspark_user_session",
  ROADMAP: "kalamspark_roadmap_data",
  TASKS: "kalamspark_daily_tasks",
  PROGRESS: "completed_stages",
};

// ─── Row → UserProfile mapper ────────────────────────────────────────────────
function mapRow(data: any): UserProfile {
  // Default settings (fallback for rows written before settings column existed)
  const defaultSettings = {
    theme: 'dark' as const,
    autoScheduleRevisions: true,
    notificationsEnabled: true,
    soundEnabled: true,
  };
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    avatar: data.avatar,
    branch: data.branch || '',
    year: data.year || '',
    educationLevel: data.education_level || '',
    schoolBoard: data.school_board || '',
    gradeOrSemester: data.grade_or_semester || '',
    collegeName: data.college_name || '',
    studyHoursPerDay: data.study_hours_per_day ?? undefined,
    targetYear: data.target_year || '',
    city: data.city || '',
    motivation: data.motivation || '',
    dream: data.dream || '',
    currentStageIndex: data.current_stage_index ?? 0,
    onboardingComplete: data.onboarding_complete ?? false,
    isAuthenticated: true,
    xp: data.xp ?? 0,
    streak: data.streak ?? 0,
    rewards: data.rewards ?? [],
    settings: data.settings ? { ...defaultSettings, ...data.settings } : defaultSettings,
    fileSpeakerData: data.file_speaker_data || {
      sources: [],
      activeId: null,
      states: {},
      checked: []
    }
  };
}

export const dbService = {

  // --- USER PROFILE ---
  async saveUser(user: UserProfile): Promise<void> {
    // ── Tier 1: Full save (requires migrate_v2.sql to have been run) ──────────
    const fullPayload: Record<string, any> = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      branch: user.branch,
      year: user.year,
      dream: user.dream,
      current_stage_index: user.currentStageIndex,
      onboarding_complete: user.onboardingComplete,
      xp: user.xp,
      streak: user.streak,
      last_sync: new Date().toISOString(),
      // Extra columns added by migrate_v2.sql:
      education_level: user.educationLevel || '',
      school_board: user.schoolBoard || '',
      grade_or_semester: user.gradeOrSemester || '',
      college_name: user.collegeName || '',
      study_hours_per_day: user.studyHoursPerDay ?? null,
      target_year: user.targetYear || '',
      city: user.city || '',
      motivation: user.motivation || '',
      rewards: user.rewards ?? [],
      file_speaker_data: user.fileSpeakerData || null,
    };

    const { error: fullError } = await supabase
      .from(TABLES.USERS)
      .upsert(fullPayload, { onConflict: 'id' });

    if (!fullError) {
      // Full save worked — also try to persist settings (separate column)
      if (user.settings) {
        await supabase.from(TABLES.USERS).update({ settings: user.settings }).eq('id', user.id);
      }
      return; // ✅ done
    }

    // ── Tier 2: Minimal save — only original schema columns (always exists) ──
    console.warn('[dbService] Full save failed (migration not run?), using minimal save:', fullError.message);
    const minimalPayload: Record<string, any> = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      branch: user.branch,
      year: user.year,
      dream: user.dream,
      current_stage_index: user.currentStageIndex,
      onboarding_complete: user.onboardingComplete,
      xp: user.xp,
      streak: user.streak,
      last_sync: new Date().toISOString(),
    };

    const { error: minError } = await supabase
      .from(TABLES.USERS)
      .upsert(minimalPayload, { onConflict: 'id' });

    if (minError) {
      console.error('[dbService] saveUser FAILED even with minimal payload:', minError.message, minError);
      throw new Error(`Failed to save user: ${minError.message}`);
    }
    // Minimal save succeeded ✅
  },


  // Returns null ONLY when the user truly does not exist in the DB.
  // Throws if there is a real Supabase error so callers can handle it properly.
  async getUser(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from(TABLES.USERS)
      .select("*")
      .eq("id", userId)
      .maybeSingle(); // returns null data (no error) when row not found

    if (error) {
      console.error('[dbService] getUser error:', error.message, error);
      throw new Error(`Failed to fetch user: ${error.message}`);
    }
    if (!data) return null; // row does not exist yet — truly a new user

    return mapRow(data);
  },

  async getUserByEmail(email: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from(TABLES.USERS)
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data);
  },

  async clearSession(): Promise<void> {
    // Sign out from Supabase Auth (clears OAuth session cookie too)
    await supabase.auth.signOut();
    // Clear all local storage keys
    localStorage.removeItem("kalamspark_user_session");
    localStorage.removeItem("kalamspark_roadmap_data");
    localStorage.removeItem("kalamspark_manual_email"); // Added for manual zero-auth sessions
    localStorage.removeItem("fs_sources");
    localStorage.removeItem("fs_active_id");
    localStorage.removeItem("fs_states");
    localStorage.removeItem("fs_checked");
    localStorage.removeItem("kalamspark_force_refresh");
    localStorage.removeItem("ks_task_variety");
    localStorage.removeItem("ks_last_task_reset");
    localStorage.removeItem("kalamspark_last_route");
    sessionStorage.removeItem("kalamspark_radar");
    sessionStorage.removeItem("fs_import_url");
  },


  // --- ROADMAP ---
  async saveRoadmap(user: UserProfile, roadmap: any): Promise<void> {
    const { error } = await supabase.from(TABLES.ROADMAPS).upsert(
      {
        user_id: user.id,
        roadmap_data: roadmap ? { ...roadmap, dream: user.dream } : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) console.error('Error saving roadmap:', error);
  },

  async getRoadmap(userId: string): Promise<any | null> {
    const { data, error } = await supabase
      .from(TABLES.ROADMAPS)
      .select("roadmap_data")
      .eq("user_id", userId)
      .single();

    if (error || !data) return null;
    return data.roadmap_data;
  },

  // --- PROGRESS ---
  async getCompletedStages(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from(TABLES.PROGRESS)
      .select("stage_id")
      .eq("user_id", userId);

    if (error) return [];
    return data.map((item: any) => item.stage_id);
  },

  async saveCompletedStage(userId: string, stageId: string): Promise<void> {
    const { error } = await supabase.from(TABLES.PROGRESS).insert({
      user_id: userId,
      stage_id: stageId,
      completed_at: new Date().toISOString(),
    });

    if (error) {
      // Ignore duplicate key error if stage already completed
      if (error.code !== "23505")
        console.error("Error saving progress:", error);
    }
  },

  async clearCompletedStages(userId: string): Promise<void> {
    const { error } = await supabase
      .from(TABLES.PROGRESS)
      .delete()
      .eq("user_id", userId);
    if (error) console.error("Error clearing progress:", error);
  },

  // --- TASKS ---
  async getTasks(userId: string): Promise<DailyTask[]> {
    const { data, error } = await supabase
      .from(TABLES.TASKS)
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false });

    if (error) return [];
    return data as DailyTask[];
  },

  async saveTask(userId: string, task: DailyTask): Promise<void> {
    const { error } = await supabase.from(TABLES.TASKS).upsert({
      id: task.id,
      user_id: userId,
      title: task.title,
      type: task.type,
      completed: task.completed,
      date: task.date,
      linked_subject: task.linkedSubject,
    }, { onConflict: 'id' });
    if (error) console.error('Error saving task:', error);
  },

  async deleteTask(taskId: string): Promise<void> {
    const { error } = await supabase
      .from(TABLES.TASKS)
      .delete()
      .eq("id", taskId);

    if (error) console.error("Error deleting task:", error);
  },

  // --- MENTOR CHAT HISTORY ---
  async saveMentorMessage(userId: string, role: 'user' | 'ai', text: string, sessionId: string): Promise<void> {
    // Each message is stored with the provided session ID so
    // all messages in one chat session are grouped in the DB
    const { error } = await supabase.from('mentor_messages').insert({
      user_id: userId,
      session_id: sessionId,
      role,
      text,
      created_at: new Date().toISOString(),
    });
    if (error) console.error("Error saving mentor message:", error);
  },

  async getMentorHistory(userId: string): Promise<{ role: 'user' | 'ai'; text: string; created_at: string }[]> {
    const { data, error } = await supabase
      .from('mentor_messages')
      .select('role, text, created_at, session_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) return [];
    return data as { role: 'user' | 'ai'; text: string; created_at: string }[];
  },

  async clearMentorHistory(userId: string): Promise<void> {
    const { error } = await supabase
      .from('mentor_messages')
      .delete()
      .eq('user_id', userId);
    if (error) console.error("Error clearing mentor history:", error);
  },

  async deleteMentorSession(userId: string, sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('mentor_messages')
      .delete()
      .eq('user_id', userId)
      .eq('session_id', sessionId);
    if (error) console.error("Error deleting mentor session:", error);
  },

  // --- REWARDS ---
  async saveReward(userId: string, reward: Reward, currentRewards: Reward[]): Promise<void> {
    const updated = [...(currentRewards || []).filter(r => r.id !== reward.id), reward];
    const { error } = await supabase
      .from(TABLES.USERS)
      .update({ rewards: updated })
      .eq('id', userId);
    if (error) console.error('Error saving reward:', error);
  },
};

