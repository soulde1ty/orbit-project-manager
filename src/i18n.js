import ru from './locales/ru.js';
import en from './locales/en.js';

export const strings = { ru, en };
const pluralRules = { ru: new Intl.PluralRules('ru'), en: new Intl.PluralRules('en') };

export function translate(language, key, values = {}) {
  const locale = language === 'ru' ? 'ru' : 'en';
  let message = strings[locale][key] ?? strings.en[key] ?? key;
  if (typeof message === 'object') {
    const form = pluralRules[locale].select(Number(values.count) || 0);
    message = message[form] || message.other;
  }
  return message.replace(/\{(\w+)\}/g, (placeholder, name) =>
    values[name] === undefined ? placeholder : String(values[name]),
  );
}
