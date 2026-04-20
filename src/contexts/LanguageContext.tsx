
import { createContext, useContext, useState, ReactNode } from 'react';
import { TRANSLATIONS } from '../data/translations';

type Language = 'en' | 'cn' | 'km';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof TRANSLATIONS.en) => string; // Helper for UI strings
  getContent: (en: any, cn?: any, km?: any) => any; // Helper for data content fallback
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children?: ReactNode }) => {
  const [language, setLanguage] = useState<Language>('en');

  // Translate UI strings (Nav, Buttons, etc.)
  const t = (key: keyof typeof TRANSLATIONS.en) => {
    return TRANSLATIONS[language]?.[key] || TRANSLATIONS.en[key];
  };

  // Smart Content Fallback: If selected lang has content, use it; otherwise fallback to EN
  const getContent = (en: any, cn?: any, km?: any) => {
    const isValid = (val: any) => {
      if (Array.isArray(val) && val.length > 0) return true;
      if (typeof val === 'string' && val.trim() !== '') return true;
      return false;
    };
    if (language === 'km' && isValid(km)) return km;
    if (language === 'cn' && isValid(cn)) return cn;
    return en;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, getContent }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
