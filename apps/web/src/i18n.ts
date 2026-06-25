import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

const storedLanguage = window.localStorage.getItem("lang");
const initialLanguage = storedLanguage === "en" || storedLanguage === "zh" ? storedLanguage : "zh";

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en }
  },
  lng: initialLanguage,
  fallbackLng: "zh",
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
