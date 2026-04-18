
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor';
  avatar: string;
  password?: string; // Only used in Mock mode
}

// Hardcoded Demo Users to ensure reliability
const DEMO_USERS: User[] = [
    {
      id: "demo_admin",
      name: "Demo Admin",
      email: "admin@dagrand.nex",
      role: "admin",
      avatar: "https://ui-avatars.com/api/?name=Admin&background=0f2b4a&color=fff",
      password: "123"
    },
    {
      id: "demo_author",
      name: "Demo Author",
      email: "author@dagrand.nex",
      role: "editor",
      avatar: "https://ui-avatars.com/api/?name=Author&background=b49b67&color=fff",
      password: "123"
    }
];

// NOTE: This is only for mock-mode local persistence to avoid clear-text storage in browser state.
// It is intentionally lightweight and is NOT a substitute for secure server-side password hashing.
const hashPassword = (value: string) => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(i);
  }
  return `h$${(hash >>> 0).toString(16)}`;
};

const isPasswordMatch = (storedPassword: string | undefined, inputPassword: string) => {
  if (!storedPassword) return false;
  // Backward compatibility for old plain-text mock users.
  if (!storedPassword.startsWith('h$')) return storedPassword === inputPassword;
  return storedPassword === hashPassword(inputPassword);
};

const sanitizeSessionUser = (value: User): User => {
  const { password, ...safeUser } = value;
  return safeUser as User;
};

interface LoginResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  users: User[];
  login: (email: string, pass: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  addUser: (user: User) => void; 
  changePassword: (currentPassword: string, newPassword: string) => Promise<LoginResult>;
  isAuthenticated: boolean;
  isLoading: boolean;
  isMockMode: boolean; 
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const mockMode = !isSupabaseConfigured();

  // --- INITIALIZATION ---
  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    const initAuth = async () => {
      // 1. Load Static & Local Users
      let allUsers: User[] = [...DEMO_USERS]; // Start with guaranteed Demo Users
      
      try {
          // Fetch static JSON
          const res = await fetch('/data/users.json');
          const contentType = res.headers.get('content-type');
          if (res.ok && contentType && contentType.includes('application/json')) {
              const data = await res.json();
              if (data && data.users) {
                  // Merge fetched users, avoiding duplicates
                  data.users.forEach((fetchedUser: User) => {
                      if (!allUsers.find(u => u.email === fetchedUser.email)) {
                          allUsers.push(fetchedUser);
                      }
                  });
              }
          }
      } catch (err) {
          console.error("Failed to load mock users, using internal fallback:", err);
      }

      // Load locally saved users (from Fallback invites)
      try {
          const localSaved = localStorage.getItem('dagrand_users_list');
          if (localSaved) {
              const parsedLocal: User[] = JSON.parse(localSaved);
              parsedLocal.forEach(u => {
                  if (!allUsers.find(staticU => staticU.email.toLowerCase() === u.email.toLowerCase())) {
                      allUsers.push(u);
                  }
              });
          }
      } catch (e) { console.error("Error parsing local users", e); }
      
      setUsers(allUsers);

      // 2. Check Session
      if (mockMode) {
        // MOCK MODE: Load session from LocalStorage
        const savedSession = localStorage.getItem('dagrand_session');
        if (savedSession) setUser(sanitizeSessionUser(JSON.parse(savedSession)));
      } else {
        try {
            // SUPABASE MODE: Check active session
            // @ts-ignore
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error) throw error;

            if (session) {
               const { user: sbUser } = session;
               const isAdminEmail = sbUser.email === 'mathyousos5@gmail.com';
               setUser({
                 id: sbUser.id,
                 email: sbUser.email || '',
                 name: sbUser.user_metadata?.full_name || (isAdminEmail ? 'Admin User' : 'User'),
                 role: sbUser.user_metadata?.role || (isAdminEmail ? 'admin' : 'editor'),
                 avatar: sbUser.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${sbUser.email}&background=153c63&color=fff`
               });
            } else {
                // Check if we have a persisted mock session even in real mode (Hybrid support)
                const savedSession = localStorage.getItem('dagrand_session');
                if (savedSession) setUser(sanitizeSessionUser(JSON.parse(savedSession)));
             }

            // Listen for auth changes
            // @ts-ignore
            const { data } = supabase.auth.onAuthStateChange((_event, session) => {
                if (session) {
                    const { user: sbUser } = session;
                    const isAdminEmail = sbUser.email === 'mathyousos5@gmail.com';
                    setUser({
                        id: sbUser.id,
                        email: sbUser.email || '',
                        name: sbUser.user_metadata?.full_name || (isAdminEmail ? 'Admin User' : 'User'),
                        role: sbUser.user_metadata?.role || (isAdminEmail ? 'admin' : 'editor'),
                        avatar: sbUser.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${sbUser.email}&background=153c63&color=fff`
                    });
                } else {
                    // Keep local session if it exists (don't auto logout mock users when Supabase updates)
                    const savedSession = localStorage.getItem('dagrand_session');
                    if (!savedSession) setUser(null);
                }
            });
            subscription = data.subscription;

        } catch (error) {
            console.error("Supabase Connection Error:", error);
            // Fallback: treat as if disconnected/offline
            const savedSession = localStorage.getItem('dagrand_session');
            if (savedSession) setUser(sanitizeSessionUser(JSON.parse(savedSession)));
        }
      }
    };

    initAuth().finally(() => setIsLoading(false));

    return () => {
        if (subscription) subscription.unsubscribe();
    };
  }, [mockMode]);

  // --- ADD USER (PERSIST LOCAL) ---
  const addUser = (newUser: User) => {
      const userToStore: User = {
          ...newUser,
          password: newUser.password ? hashPassword(newUser.password) : undefined
      };
      setUsers(prev => {
          const updated = [...prev, userToStore];
          // Persist only the custom added ones (simulate DB)
          const mockUsersToSave = updated.filter(u => u.password && !DEMO_USERS.find(d => d.email === u.email)); 
          localStorage.setItem('dagrand_users_list', JSON.stringify(mockUsersToSave));
          return updated;
      });
  };

  // --- LOGIN ---
  const login = async (email: string, pass: string): Promise<LoginResult> => {
    let sbError = null;

    // 1. Try Supabase Login first (if configured)
    if (!mockMode) {
      try {
          // @ts-ignore
          const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
          
          if (!error && data.session) return { success: true };
          
          // LOG ERROR BUT CONTINUE: This allows fallback to local users if Supabase fails
          if (error) {
              console.warn("Supabase Login Failed (Attempting Local Fallback):", error.message);
              sbError = error.message;
          }
      } catch (err) {
          console.error("Supabase Login Exception:", err);
          sbError = "Network Error";
      }
    }

    // 2. Try Local/Mock Users Check (Fallback)
    // We trim and lowercase to ensure case-insensitivity consistency
    const foundUser = users.find(
      u => u.email.trim().toLowerCase() === email.trim().toLowerCase() && isPasswordMatch(u.password, pass)
    );
    if (foundUser) {
      const safeUser = sanitizeSessionUser(foundUser);
      setUser(safeUser);
      localStorage.setItem('dagrand_session', JSON.stringify(safeUser));
      return { success: true };
    }

    // Return detailed error if Supabase failed AND local failed
    if (sbError) {
        return { success: false, error: sbError };
    }

    return { success: false, error: "Invalid credentials" };
  };

  // --- LOGOUT ---
  const logout = async () => {
    localStorage.removeItem('dagrand_session');
    
    if (!mockMode) {
      try {
          // @ts-ignore
          await supabase.auth.signOut();
      } catch (e) {
          console.error("Supabase Logout Error:", e);
      }
    }
    
    setUser(null);
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<LoginResult> => {
    if (!user) return { success: false, error: 'User session not found' };

    if (mockMode) {
      const foundUser = users.find(u => u.id === user.id);
      if (!foundUser) return { success: false, error: 'User not found' };
      if (!isPasswordMatch(foundUser.password, currentPassword)) {
        return { success: false, error: 'Current password is incorrect' };
      }

      const updatedUser = { ...foundUser, password: hashPassword(newPassword) };
      setUsers(prev => {
        const updatedUsers = prev.map(u => u.id === user.id ? updatedUser : u);
        const mockUsersToSave = updatedUsers.filter(u => u.password && !DEMO_USERS.find(d => d.email === u.email));
        localStorage.setItem('dagrand_users_list', JSON.stringify(mockUsersToSave));
        return updatedUsers;
      });
      const safeUser = sanitizeSessionUser(updatedUser);
      setUser(safeUser);
      localStorage.setItem('dagrand_session', JSON.stringify(safeUser));
      return { success: true };
    }

    try {
      if (!supabase) return { success: false, error: 'Auth service unavailable' };
      // Verify current password before allowing change.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) return { success: false, error: 'Current password is incorrect' };

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) return { success: false, error: updateError.message };

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update password' };
    }
  };

  return (
    <AuthContext.Provider value={{ user, users, login, logout, addUser, changePassword, isAuthenticated: !!user, isLoading, isMockMode: mockMode }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
