/* Cấu hình thuần, tách khỏi SDK để UI có thể render tĩnh mà không khởi tạo
 * Supabase. Vite cấp `import.meta.env`; Node unit test thì phản ánh đúng trạng
 * thái chưa cấu hình. */
const env = import.meta.env ?? ({} as ImportMetaEnv);

export const supabaseUrl = env.VITE_SUPABASE_URL || "";
export const supabaseAnonKey = env.VITE_SUPABASE_ANON || "";

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);
