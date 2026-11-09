import type { MausColor } from "../../shared/wire";
import { t } from "@/lib/i18n";
import { en, type LocaleKey } from "@/locales";

const named = (key: string, fallback: string): string => Object.hasOwn(en, key) ? t(key as LocaleKey) : fallback;

export const colorName = (color: MausColor): string => named(`mascot.color.${color}`, color);
export const expressionName = (state: string): string => named(`mascot.expression.${state}`, state);
