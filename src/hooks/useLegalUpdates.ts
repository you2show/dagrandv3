import { useState, useEffect } from 'react';
import { LegalUpdate } from '../../types';
import { MOCK_UPDATES } from '../../constants';
import { supabase } from '../lib/supabaseClient';

const parseDate = (dateStr: string): number => {
  // Normalize all-uppercase month names (e.g. "OCTOBER 21, 2025") to title case
  // so Date.parse reliably handles them across all JS engines.
  const normalized = dateStr.replace(/\b[A-Z]{3,}\b/g, w => w.charAt(0) + w.slice(1).toLowerCase());
  const ms = Date.parse(normalized);
  return isNaN(ms) ? 0 : ms;
};

const sortByDateDesc = (items: LegalUpdate[]): LegalUpdate[] =>
  [...items].sort((a, b) => parseDate(b.date) - parseDate(a.date));

export const useLegalUpdates = () => {
  const [updates, setUpdates] = useState<LegalUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUpdates = async () => {
      // 1. Check if Supabase client is available
      if (!supabase) {
        console.warn("Supabase client not configured. Using Mock Data.");
        setUpdates(sortByDateDesc(MOCK_UPDATES));
        setLoading(false);
        return;
      }

      try {
        // 2. Fetch from 'articles' table in Supabase
        const { data, error } = await supabase
          .from('articles')
          .select('*');

        if (error) {
          throw error;
        }

        if (data && data.length > 0) {
          setUpdates(sortByDateDesc(data as LegalUpdate[]));
        } else {
          // Fallback to Mock data if database is empty (optional)
          // or just show empty list: setUpdates([])
           console.log("No articles in database, using fallback.");
           setUpdates(sortByDateDesc(MOCK_UPDATES));
        }

      } catch (err) {
        console.error("Error loading updates from Supabase:", err);
        // Fallback on error so the site isn't broken
        setUpdates(sortByDateDesc(MOCK_UPDATES));
      } finally {
        setLoading(false);
      }
    };

    fetchUpdates();
  }, []);

  return { updates, loading };
};