import React, { createContext, useContext, useState } from 'react';
import { I18N, t as translate } from '../i18n/strings';

const LangContext = createContext();

export function LangProvider({ children }) {
  const [lang, setLang] = useState('en');
  const strings = I18N[lang] || I18N.en;
  const t = (key) => strings[key] || I18N.en[key] || key;
  return (
    <LangContext.Provider value={{ lang, setLang, t, strings }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() { return useContext(LangContext); }
