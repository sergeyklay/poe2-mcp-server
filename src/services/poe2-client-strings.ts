/**
 * Localized client strings for PoE2 item clipboard parsing.
 * Supports all 11 official PoE2 languages.
 *
 * Data sources:
 * - Awakened PoE Trade: EN, RU, KO, ZH-TW
 * - Sidekick: DE, FR, JA, ES, PT, TH, ZH-CN
 */

/** Supported PoE2 client languages. */
export type SupportedLanguage =
  | 'en'
  | 'ru'
  | 'ko'
  | 'zh-TW'
  | 'zh-CN'
  | 'de'
  | 'fr'
  | 'ja'
  | 'es'
  | 'pt'
  | 'th';

/** Localized client strings for parsing item clipboard text. */
export interface ClientStrings {
  RARITY: string;
  ITEM_CLASS: string;
  ITEM_LEVEL: string;
  QUALITY: string;
  SOCKETS: string;
  CORRUPTED: string;
  UNIDENTIFIED: string;
  MIRRORED: string;
  PHYSICAL_DAMAGE: string;
  ELEMENTAL_DAMAGE: string;
  ENERGY_SHIELD: string;
  ARMOUR: string;
  EVASION: string;
  CRIT_CHANCE: string;
  ATTACK_SPEED: string;
  REQUIRES: string;
  /** Multi-line requirements block header (e.g., "Requirements:"). */
  REQUIREMENTS_HEADER: string;
  STACK_SIZE: string;
  RARITY_NORMAL: string;
  RARITY_MAGIC: string;
  RARITY_RARE: string;
  RARITY_UNIQUE: string;
  RARITY_CURRENCY: string;
  RARITY_GEM: string;
}

const CLIENT_STRINGS_EN: ClientStrings = {
  RARITY: 'Rarity: ',
  ITEM_CLASS: 'Item Class: ',
  ITEM_LEVEL: 'Item Level: ',
  QUALITY: 'Quality: ',
  SOCKETS: 'Sockets: ',
  CORRUPTED: 'Corrupted',
  UNIDENTIFIED: 'Unidentified',
  MIRRORED: 'Mirrored',
  PHYSICAL_DAMAGE: 'Physical Damage: ',
  ELEMENTAL_DAMAGE: 'Elemental Damage: ',
  ENERGY_SHIELD: 'Energy Shield: ',
  ARMOUR: 'Armour: ',
  EVASION: 'Evasion Rating: ',
  CRIT_CHANCE: 'Critical Strike Chance: ',
  ATTACK_SPEED: 'Attacks per Second: ',
  REQUIRES: 'Requires',
  REQUIREMENTS_HEADER: 'Requirements',
  STACK_SIZE: 'Stack Size: ',
  RARITY_NORMAL: 'Normal',
  RARITY_MAGIC: 'Magic',
  RARITY_RARE: 'Rare',
  RARITY_UNIQUE: 'Unique',
  RARITY_CURRENCY: 'Currency',
  RARITY_GEM: 'Gem',
};

const CLIENT_STRINGS_RU: ClientStrings = {
  RARITY: 'Редкость: ',
  ITEM_CLASS: 'Класс предмета: ',
  ITEM_LEVEL: 'Уровень предмета: ',
  QUALITY: 'Качество: ',
  SOCKETS: 'Гнезда: ',
  CORRUPTED: 'Осквернено',
  UNIDENTIFIED: 'Неопознано',
  MIRRORED: 'Отражено',
  PHYSICAL_DAMAGE: 'Физический урон: ',
  ELEMENTAL_DAMAGE: 'Урон от стихий: ',
  ENERGY_SHIELD: 'Энерг. щит: ',
  ARMOUR: 'Броня: ',
  EVASION: 'Уклонение: ',
  CRIT_CHANCE: 'Шанс крит. удара: ',
  ATTACK_SPEED: 'Атак в секунду: ',
  REQUIRES: 'Требуется',
  REQUIREMENTS_HEADER: 'Требования',
  STACK_SIZE: 'Размер стопки: ',
  RARITY_NORMAL: 'Обычный',
  RARITY_MAGIC: 'Волшебный',
  RARITY_RARE: 'Редкий',
  RARITY_UNIQUE: 'Уникальный',
  RARITY_CURRENCY: 'Валюта',
  RARITY_GEM: 'Камень',
};

const CLIENT_STRINGS_KO: ClientStrings = {
  RARITY: '희귀도: ',
  ITEM_CLASS: '아이템 종류: ',
  ITEM_LEVEL: '아이템 레벨: ',
  QUALITY: '퀄리티: ',
  SOCKETS: '홈: ',
  CORRUPTED: '타락',
  UNIDENTIFIED: '미확인',
  MIRRORED: '복제',
  PHYSICAL_DAMAGE: '물리 피해: ',
  ELEMENTAL_DAMAGE: '원소 피해: ',
  ENERGY_SHIELD: '에너지 보호막: ',
  ARMOUR: '방어도: ',
  EVASION: '회피: ',
  CRIT_CHANCE: '치명타 확률: ',
  ATTACK_SPEED: '초당 공격 횟수: ',
  REQUIRES: '요구 사항',
  REQUIREMENTS_HEADER: '요구사항',
  STACK_SIZE: '최대 중첩: ',
  RARITY_NORMAL: '일반',
  RARITY_MAGIC: '마법',
  RARITY_RARE: '희귀',
  RARITY_UNIQUE: '고유',
  RARITY_CURRENCY: '화폐',
  RARITY_GEM: '젬',
};

const CLIENT_STRINGS_ZH_TW: ClientStrings = {
  RARITY: '稀有度: ',
  ITEM_CLASS: '物品種類: ',
  ITEM_LEVEL: '物品等級: ',
  QUALITY: '品質: ',
  SOCKETS: '插槽: ',
  CORRUPTED: '已汙染',
  UNIDENTIFIED: '未鑑定',
  MIRRORED: '已複製',
  PHYSICAL_DAMAGE: '物理傷害: ',
  ELEMENTAL_DAMAGE: '元素傷害: ',
  ENERGY_SHIELD: '能量護盾: ',
  ARMOUR: '護甲: ',
  EVASION: '閃避值: ',
  CRIT_CHANCE: '暴擊率: ',
  ATTACK_SPEED: '每秒攻擊次數: ',
  REQUIRES: '需求',
  REQUIREMENTS_HEADER: '需求',
  STACK_SIZE: '堆疊數量: ',
  RARITY_NORMAL: '普通',
  RARITY_MAGIC: '魔法',
  RARITY_RARE: '稀有',
  RARITY_UNIQUE: '傳奇',
  RARITY_CURRENCY: '通貨',
  RARITY_GEM: '寶石',
};

const CLIENT_STRINGS_ZH_CN: ClientStrings = {
  RARITY: '稀有度: ',
  ITEM_CLASS: '物品类别: ',
  ITEM_LEVEL: '物品等级: ',
  QUALITY: '品质: ',
  SOCKETS: '插槽: ',
  CORRUPTED: '已污染',
  UNIDENTIFIED: '未鉴定',
  MIRRORED: '已复制',
  PHYSICAL_DAMAGE: '物理伤害: ',
  ELEMENTAL_DAMAGE: '元素伤害: ',
  ENERGY_SHIELD: '能量护盾: ',
  ARMOUR: '护甲: ',
  EVASION: '闪避值: ',
  CRIT_CHANCE: '暴击率: ',
  ATTACK_SPEED: '每秒攻击次数: ',
  REQUIRES: '需要',
  REQUIREMENTS_HEADER: '需求',
  STACK_SIZE: '堆叠数量: ',
  RARITY_NORMAL: '普通',
  RARITY_MAGIC: '魔法',
  RARITY_RARE: '稀有',
  RARITY_UNIQUE: '传奇',
  RARITY_CURRENCY: '通货',
  RARITY_GEM: '宝石',
};

const CLIENT_STRINGS_DE: ClientStrings = {
  RARITY: 'Seltenheit: ',
  ITEM_CLASS: 'Gegenstandsklasse: ',
  ITEM_LEVEL: 'Gegenstandsstufe: ',
  QUALITY: 'Qualität: ',
  SOCKETS: 'Fassungen: ',
  CORRUPTED: 'Verderbt',
  UNIDENTIFIED: 'Nicht identifiziert',
  MIRRORED: 'Gespiegelt',
  PHYSICAL_DAMAGE: 'Physischer Schaden: ',
  ELEMENTAL_DAMAGE: 'Elementarschaden: ',
  ENERGY_SHIELD: 'Energieschild: ',
  ARMOUR: 'Rüstung: ',
  EVASION: 'Ausweichwert: ',
  CRIT_CHANCE: 'Kritische Trefferchance: ',
  ATTACK_SPEED: 'Angriffe pro Sekunde: ',
  REQUIRES: 'Benötigt',
  REQUIREMENTS_HEADER: 'Anforderungen',
  STACK_SIZE: 'Stapelgröße: ',
  RARITY_NORMAL: 'Normal',
  RARITY_MAGIC: 'Magisch',
  RARITY_RARE: 'Selten',
  RARITY_UNIQUE: 'Einzigartig',
  RARITY_CURRENCY: 'Währung',
  RARITY_GEM: 'Gemme',
};

const CLIENT_STRINGS_FR: ClientStrings = {
  RARITY: 'Rareté: ',
  ITEM_CLASS: "Classe d'objet: ",
  ITEM_LEVEL: "Niveau de l'objet: ",
  QUALITY: 'Qualité: ',
  SOCKETS: 'Châsses: ',
  CORRUPTED: 'Corrompu',
  UNIDENTIFIED: 'Non identifié',
  MIRRORED: 'Reflété',
  PHYSICAL_DAMAGE: 'Dégâts physiques: ',
  ELEMENTAL_DAMAGE: 'Dégâts élémentaires: ',
  ENERGY_SHIELD: "Bouclier d'énergie: ",
  ARMOUR: 'Armure: ',
  EVASION: "Taux d'évasion: ",
  CRIT_CHANCE: 'Chances de coup critique: ',
  ATTACK_SPEED: 'Attaques par seconde: ',
  REQUIRES: 'Requiert',
  REQUIREMENTS_HEADER: 'Prérequis',
  STACK_SIZE: 'Taille de la pile: ',
  RARITY_NORMAL: 'Normal',
  RARITY_MAGIC: 'Magique',
  RARITY_RARE: 'Rare',
  RARITY_UNIQUE: 'Unique',
  RARITY_CURRENCY: 'Objet monétaire',
  RARITY_GEM: 'Gemme',
};

const CLIENT_STRINGS_JA: ClientStrings = {
  RARITY: 'レアリティ: ',
  ITEM_CLASS: 'アイテムクラス: ',
  ITEM_LEVEL: 'アイテムレベル: ',
  QUALITY: '品質: ',
  SOCKETS: 'ソケット: ',
  CORRUPTED: 'コラプト状態',
  UNIDENTIFIED: '未鑑定',
  MIRRORED: 'ミラー',
  PHYSICAL_DAMAGE: '物理ダメージ: ',
  ELEMENTAL_DAMAGE: '元素ダメージ: ',
  ENERGY_SHIELD: 'エナジーシールド: ',
  ARMOUR: 'アーマー: ',
  EVASION: '回避力: ',
  CRIT_CHANCE: 'クリティカル率: ',
  ATTACK_SPEED: '毎秒攻撃回数: ',
  REQUIRES: '必要条件',
  REQUIREMENTS_HEADER: '要求',
  STACK_SIZE: 'スタックサイズ: ',
  RARITY_NORMAL: 'ノーマル',
  RARITY_MAGIC: 'マジック',
  RARITY_RARE: 'レア',
  RARITY_UNIQUE: 'ユニーク',
  RARITY_CURRENCY: 'カレンシー',
  RARITY_GEM: 'ジェム',
};

const CLIENT_STRINGS_ES: ClientStrings = {
  RARITY: 'Rareza: ',
  ITEM_CLASS: 'Clase de objeto: ',
  ITEM_LEVEL: 'Nivel del objeto: ',
  QUALITY: 'Calidad: ',
  SOCKETS: 'Engarces: ',
  CORRUPTED: 'Corrupto',
  UNIDENTIFIED: 'Sin identificar',
  MIRRORED: 'Reflejado',
  PHYSICAL_DAMAGE: 'Daño físico: ',
  ELEMENTAL_DAMAGE: 'Daño elemental: ',
  ENERGY_SHIELD: 'Escudo de energía: ',
  ARMOUR: 'Armadura: ',
  EVASION: 'Evasión: ',
  CRIT_CHANCE: 'Probabilidad de impacto crítico: ',
  ATTACK_SPEED: 'Ataques por segundo: ',
  REQUIRES: 'Requiere',
  REQUIREMENTS_HEADER: 'Requisitos',
  STACK_SIZE: 'Tamaño de pila: ',
  RARITY_NORMAL: 'Normal',
  RARITY_MAGIC: 'Mágico',
  RARITY_RARE: 'Raro',
  RARITY_UNIQUE: 'Único',
  RARITY_CURRENCY: 'Objetos monetarios',
  RARITY_GEM: 'Gema',
};

const CLIENT_STRINGS_PT: ClientStrings = {
  RARITY: 'Raridade: ',
  ITEM_CLASS: 'Classe do Item: ',
  ITEM_LEVEL: 'Nível do Item: ',
  QUALITY: 'Qualidade: ',
  SOCKETS: 'Encaixes: ',
  CORRUPTED: 'Corrompido',
  UNIDENTIFIED: 'Não Identificado',
  MIRRORED: 'Espelhado',
  PHYSICAL_DAMAGE: 'Dano Físico: ',
  ELEMENTAL_DAMAGE: 'Dano Elemental: ',
  ENERGY_SHIELD: 'Escudo de Energia: ',
  ARMOUR: 'Armadura: ',
  EVASION: 'Evasão: ',
  CRIT_CHANCE: 'Chance de Acerto Crítico: ',
  ATTACK_SPEED: 'Ataques por Segundo: ',
  REQUIRES: 'Requer',
  REQUIREMENTS_HEADER: 'Requisitos',
  STACK_SIZE: 'Tamanho da Pilha: ',
  RARITY_NORMAL: 'Normal',
  RARITY_MAGIC: 'Mágico',
  RARITY_RARE: 'Raro',
  RARITY_UNIQUE: 'Único',
  RARITY_CURRENCY: 'Moeda',
  RARITY_GEM: 'Gema',
};

const CLIENT_STRINGS_TH: ClientStrings = {
  RARITY: 'ความหายาก: ',
  ITEM_CLASS: 'ประเภทไอเท็ม: ',
  ITEM_LEVEL: 'เลเวลไอเท็ม: ',
  QUALITY: 'คุณภาพ: ',
  SOCKETS: 'รู: ',
  CORRUPTED: 'มีมลทิน',
  UNIDENTIFIED: 'ยังไม่ได้ตรวจสอบ',
  MIRRORED: 'สะท้อน',
  PHYSICAL_DAMAGE: 'ความเสียหายกายภาพ: ',
  ELEMENTAL_DAMAGE: 'ความเสียหายธาตุ: ',
  ENERGY_SHIELD: 'โล่พลังงาน: ',
  ARMOUR: 'ค่าเกราะ: ',
  EVASION: 'อัตราการหลบหลีก: ',
  CRIT_CHANCE: 'โอกาสคริติคอล: ',
  ATTACK_SPEED: 'จำนวนครั้งการโจมตีต่อวินาที: ',
  REQUIRES: 'ต้องการ',
  REQUIREMENTS_HEADER: 'ข้อกำหนด',
  STACK_SIZE: 'ขนาดกอง: ',
  RARITY_NORMAL: 'ปกติ',
  RARITY_MAGIC: 'เวทมนตร์',
  RARITY_RARE: 'หายาก',
  RARITY_UNIQUE: 'เฉพาะ',
  RARITY_CURRENCY: 'เงินตรา',
  RARITY_GEM: 'หิน',
};

/** All supported language strings mapped by language code. */
export const CLIENT_STRINGS: Record<SupportedLanguage, ClientStrings> = {
  en: CLIENT_STRINGS_EN,
  ru: CLIENT_STRINGS_RU,
  ko: CLIENT_STRINGS_KO,
  'zh-TW': CLIENT_STRINGS_ZH_TW,
  'zh-CN': CLIENT_STRINGS_ZH_CN,
  de: CLIENT_STRINGS_DE,
  fr: CLIENT_STRINGS_FR,
  ja: CLIENT_STRINGS_JA,
  es: CLIENT_STRINGS_ES,
  pt: CLIENT_STRINGS_PT,
  th: CLIENT_STRINGS_TH,
};

/** Language detection pattern with unique identifying keywords. */
interface LanguagePattern {
  code: SupportedLanguage;
  keywords: string[];
}

/** Ordered language patterns by script specificity (non-Latin first, Latin last). */
const LANGUAGE_PATTERNS: LanguagePattern[] = [
  { code: 'ja', keywords: ['アイテムクラス', 'レアリティ', 'アイテムレベル'] },
  { code: 'ko', keywords: ['아이템 종류', '희귀도', '아이템 레벨'] },
  // zh-CN must come before zh-TW because simplified chars are checked first
  { code: 'zh-CN', keywords: ['物品类别', '物品等级', '能量护盾'] },
  { code: 'zh-TW', keywords: ['物品種類', '物品類別', '稀有度', '物品等級'] },
  {
    code: 'th',
    keywords: ['ประเภทไอเท็ม', 'ความหายาก', 'เลเวลไอเท็ม', 'ประเภทไอเทม', 'เลเวลไอเทม'],
  },
  { code: 'ru', keywords: ['Класс предмета', 'Редкость', 'Уровень предмета'] },
  { code: 'de', keywords: ['Gegenstandsklasse', 'Seltenheit', 'Gegenstandsstufe'] },
  { code: 'fr', keywords: ["Classe d'objet", 'Rareté', "Niveau de l'objet"] },
  { code: 'es', keywords: ['Clase de objeto', 'Rareza', 'Nivel de objeto'] },
  { code: 'pt', keywords: ['Classe do Item', 'Raridade', 'Nível do Item'] },
  { code: 'en', keywords: ['Item Class', 'Rarity', 'Item Level'] },
];

/**
 * Detect language from clipboard text by matching known keywords.
 * @param text - Raw item clipboard text.
 * @returns Language code and corresponding ClientStrings.
 */
export function detectLanguage(text: string): { code: SupportedLanguage; strings: ClientStrings } {
  for (const { code, keywords } of LANGUAGE_PATTERNS) {
    if (keywords.some((kw) => text.includes(kw))) {
      return { code, strings: CLIENT_STRINGS[code] };
    }
  }
  // Default to English if no match found
  return { code: 'en', strings: CLIENT_STRINGS.en };
}

// ─────────────────────────────────────────────────────────────────────────────
// Language-Specific Regex Patterns
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pattern to match "Grants Skill:" lines across all supported languages.
 * Used to extract granted skills and filter them from explicit mods.
 */
export const GRANTED_SKILL_PATTERN =
  /(?:Grants? Skill|Дарует умение|Даёт умение|스킬 부여|賦予技能|赋予技能|Gewährt Fertigkeit|Verleiht Fertigkeit|Octroie|Compétence octroyée|スキルを付与|スキル付与|Otorga habilidad|Concede [Hh]abilidade|มอบสกิล)[:\s]*(.+)/i;

/**
 * Pattern to match "Socketed Rune:" lines (metadata, not actual mods).
 * These should be filtered out from the modifiers list.
 */
export const SOCKETED_RUNE_PATTERN =
  /^(?:Socketed Rune|Вставленная руна|장착된 룬|鑲嵌的符文|镶嵌的符文|Eingefasste Rune|Rune sertie|ソケットされたルーン|Runa engarzada|Runa Encaixada|รูนที่ใส่)[:\s]/i;

/**
 * Pattern to match reload time stat lines across all supported languages.
 */
export const RELOAD_TIME_PATTERN =
  /^(?:Reload Time|Время перезарядки|재장전 시간|裝填時間|装填时间|Nachladezeit|Temps de rechargement|リロード時間|Tiempo de recarga|Tempo de Recarga|เวลารีโหลด)[：:]/i;

/** Pattern to match sockets lines across all supported languages. */
export const SOCKETS_PATTERN =
  /^(?:Sockets|Гн[её]зда|Ячейки|홈|插槽|Fassung(?:en)?|Châsses|ソケット|Engarces|Encaixes|Engastes|รู|ช่องเจียระไน|ช่องใส่)[：:\s]/i;

/**
 * Pattern to match level requirements across all supported languages.
 * Captures the numeric level value.
 */
export const LEVEL_REQUIREMENT_PATTERN =
  /(?:Level|Уровень|레벨|等級|等级|Stufe|Niveau|レベル|Nivel|Nível|เลเวล)[:\s]+(\d+)/i;

/**
 * Pattern to match Strength requirements across all supported languages.
 * Captures: (1) or (2) numeric value - check both groups.
 * Supports both "55 Str" (inline) and "Str: 55" (multi-line) formats.
 */
export const STRENGTH_REQUIREMENT_PATTERN =
  /(?:(?:Str|Strength|Сила|Сил|힘|力量|Stärke|Force|Fue|For|Força|พลัง)[:\s]+(\d+))|(?:(\d+)\s*(?:\((?:unmet|augmented)\)\s*)?(?:Str|Strength|Сила|Сил|힘|力量|Stärke|Force|Fue|For|Força|พลัง)(?=\s|,|$))/i;

/**
 * Pattern to match Dexterity requirements across all supported languages.
 * Captures: (1) or (2) numeric value - check both groups.
 * Supports both "55 Dex" (inline) and "Dex: 55" (multi-line) formats.
 */
export const DEXTERITY_REQUIREMENT_PATTERN =
  /(?:(?:Dex|Dexterity|Ловкость|Ловк|민첩|敏捷|Geschick|Dextérité|Des|Agilidade|ความคล่องแคล่ว)[:\s]+(\d+))|(?:(\d+)\s*(?:\((?:unmet|augmented)\)\s*)?(?:Dex|Dexterity|Ловкость|Ловк|민첩|敏捷|Geschick|Dextérité|Des|Agilidade|ความคล่องแคล่ว)(?=\s|,|$))/i;

/**
 * Pattern to match Intelligence requirements across all supported languages.
 * Captures: (1) or (2) numeric value - check both groups.
 * Supports both "55 Int" (inline) and "Int: 55" (multi-line) formats.
 */
export const INTELLIGENCE_REQUIREMENT_PATTERN =
  /(?:(?:Int|Intelligence|Интеллект|Инт|지능|智慧|智力|知性|Intelligenz|สติปัญญา|ปัญญา|อินเทล)[:\s]+(\d+))|(?:(\d+)\s*(?:\((?:unmet|augmented)\)\s*)?(?:Int|Intelligence|Интеллект|Инт|지능|智慧|智力|知性|Intelligenz|สติปัญญา|ปัญญา|อินเทล)(?=\s|,|$))/i;

/**
 * Pattern to match Energy Shield stat lines across all supported languages.
 * Handles both abbreviated and full forms (e.g., Russian has "Энерг. щит" and "Энергетический щит").
 */
export const ENERGY_SHIELD_PATTERN =
  /^(?:Energy Shield|Энерг\. щит|Энергетический щит|에너지 보호막|能量護盾|能量护盾|Energieschild|Bouclier d'énergie|エナジーシールド|Escudo de energía|Escudo de Energia|โล่พลังงาน)[：:]/i;

/**
 * Pattern to match Block Chance stat lines across all supported languages.
 * Used for shields/bucklers.
 */
export const BLOCK_CHANCE_PATTERN =
  /^(?:Block Chance|Шанс блока|막기 확률|格擋率|格挡率|Blockchance|Chances de blocage|ブロック率|Probabilidad de bloqueo|Chance de Bloqueio|โอกาสบล็อก)[：:]/i;

/**
 * Pattern to match "Socketed in X:" rune effect lines.
 * Each line describes a rune's effect when socketed in a specific slot type.
 */
export const RUNE_EFFECT_PATTERN =
  /^(?:Socketed in|Вставлен[оа]? в|소켓|鑲嵌於|镶嵌于|Gefasst in|Serti[e]? dans|のソケットに装着|Engarzad[oa] en|Encaixad[oa] em|ใส่ใน)\s*(Weapon|Armour|Helmet|Gloves|Boots|Shield|оружие|доспех|шлем|перчатки|сапоги|щит|무기|갑옷|투구|장갑|신발|방패|武器|護甲|頭盔|手套|鞋子|盾|头盔|手套|鞋子|Waffe|Rüstung|Helm|Handschuhe|Stiefel|Schild|arme|armure|casque|gants|bottes|bouclier|武器|鎧|兜|グローブ|ブーツ|シールド|arma|armadura|casco|guantes|botas|escudo|capacete|luvas|botas|escudo|อาวุธ|เกราะ|หมวก|ถุงมือ|รองเท้า|โล่)[:\s]/i;

/**
 * Pattern to match flask recovery lines.
 */
export const FLASK_RECOVERY_PATTERN =
  /^(?:Recovers|Восстанавливает|회복|恢復|恢复|Regeneriert|Récupère|回復する|Recupera|Recupera|ฟื้นฟู)\s+\d+/i;

/**
 * Pattern to match flask charges lines.
 */
export const FLASK_CHARGES_PATTERN =
  /^(?:Consumes|Currently has|Потребляет|Сейчас осталось|소모|현재|消耗|目前|Verbraucht|Aktuell|Consomme|Possède actuellement|消費する|現在|Consume|Actualmente|Consome|Atualmente|ใช้|ปัจจุบันมี)\s+\d+/i;

/**
 * Pattern to match charm duration lines.
 */
export const CHARM_DURATION_PATTERN =
  /^(?:Lasts|Длится|지속|持續|持续|Dauert|Dure|持続する|Dura|Dura|คงอยู่)\s+\d+(?:\.\d+)?\s*(?:Seconds?|секунд|초|秒|Sekunden|secondes|秒間|segundos|วินาที)/i;

/**
 * Pattern to match charm limit lines.
 */
export const CHARM_LIMIT_PATTERN =
  /^(?:Limit|Лимит|제한|限制|Limit|Limite|上限|Límite|Limite|จำกัด)[:\s]+\d+$/i;

/**
 * Pattern to match Area Level lines (waystones/maps).
 */
export const AREA_LEVEL_PATTERN =
  /^(?:Area Level|Уровень области|지역 레벨|區域等級|区域等级|Gebietsstufe|Niveau de la zone|エリアレベル|Nivel de área|Nível de Área|เลเวลพื้นที่)[:\s]+(\d+)$/i;

/** Pattern to match usage instruction lines (filtered from mods). */
export const USAGE_INSTRUCTION_PATTERN =
  /^(?:Right click|Click derecho|Clique com o botão direito|Faites un clic droit|Rechtsklicken|右クリック|右键|右鍵|우클릭|คลิกขวา|Place into an(?:| allocated)|Can be (?:Socketed|used)|Tablets are consumed|Travel to this|Reisen Sie zu|Voyagez vers|Usalo en|Use em|Utiliser dans)/i;

/**
 * Pattern to match gem Level lines.
 */
export const GEM_LEVEL_PATTERN =
  /^(?:Level|Уровень|레벨|等級|等级|Stufe|Niveau|レベル|Nivel|Nível|เลเวล)[:\s]+(\d+)/i;

/** Pattern to match gem Mana Cost lines. */
export const GEM_MANA_COST_PATTERN =
  /^(?:Mana Cost|Затраты маны|Расход маны|마나 소모|魔力消耗|Manakosten|Coût en mana|マナコスト|Coste de maná|Custo de Mana|ค่ามานา)[:\s]+(\d+)/i;

/**
 * Pattern to match gem Mana Multiplier lines (support gems).
 */
export const GEM_MANA_MULTIPLIER_PATTERN =
  /^(?:Mana Multiplier|Множитель маны|마나 배율|魔力倍率|Manamultiplikator|Multiplicateur de mana|マナ倍率|Multiplicador de maná|Multiplicador de Mana|ตัวคูณมานา)[:\s]+(\d+)%/i;

/**
 * Pattern to match gem Cast Time lines.
 */
export const GEM_CAST_TIME_PATTERN =
  /^(?:Cast Time|Время применения|시전 시간|施放時間|施放时间|Zauberzeit|Temps d'incantation|詠唱時間|Tiempo de lanzamiento|Tempo de Conjuração|เวลาร่าย)[:\s]+([\d.]+)\s*(?:sec|сек|초|秒|Sek|s|วินาที)/i;

/**
 * Pattern to match gem tags line (comma-separated words without colons).
 * Tags are the first line of gem content: "Chaos, Spell, Projectile, Duration"
 */
export const GEM_TAGS_PATTERN =
  /^[A-Za-zА-Яа-яぁ-んァ-ン一-龯가-힣ก-๙]+(?:,\s*[A-Za-zА-Яа-яぁ-んァ-ン一-龯가-힣ก-๙]+)+$/;

/** Pattern to match gem Critical Hit Chance lines. */
export const GEM_CRIT_CHANCE_PATTERN =
  /^(?:Critical Hit Chance|Шанс критического удара|크리티컬 확률|暴擊率|爆击率|Kritische Trefferchance|Chances de coup critique|クリティカル率|Probabilidad de golpe crítico|Chance de Acerto Crítico|โอกาสคริติคอล)[:\s]+([\d.]+)%?/i;

/** Pattern to match gem Damage Effectiveness lines. */
export const GEM_EFFECTIVENESS_PATTERN =
  /^(?:Damage Effectiveness|Эффективность урона|피해 효ก|傷害效率|伤害效率|Schadenseffektivität|Efficacité des dégâts|ダメージ係数|Efectividad del daño|Eficácia de Dano|ประสิทธิภาพความเสียหาย)[:\s]+([\d.]+)%?/i;

/** Pattern to match modifier header lines like `{ Prefix Modifier }` (filtered from mods). */
export const MODIFIER_HEADER_PATTERN = /^\{[^}]+\}$/;

/** Pattern to match "Limited to: N" lines (jewels). */
export const LIMIT_PATTERN =
  /^(?:Limited to|\u041e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u043e|\uc81c\ud55c|限制|Begrenzt auf|Limité à|上限|Limitado a|Limitado a|จำกัด)[:\s]+(\d+)$/i;

/** Pattern to match "Tier: N" lines (uncut gems, waystones). */
export const TIER_PATTERN =
  /^(?:Tier|Уровень|티ิอ|階層|阶层|Stufe|Palier|ティア|Nivel|Nível|ระดับ)[:\s]+(\d+)$/i;

/** Pattern to match socketable effect lines (runes, soul cores). */
export const SOCKETABLE_EFFECT_PATTERN =
  /^(?:Weapons?|Armou?r|Helmet|Gloves|Boots|Shield|Оружие|Доспех|Шлем|Перчатки|Ботинки|Щир|무기|갑옷|투구|장갑|신발|방패|武器|護甲|頭盔|手套|鞋子|盾|护甲|Waffe|Rüstung|Helm|Handschuhe|Stiefel|Schild|arme|armure|casque|gants|bottes|bouclier|武器|鎧|兜|グローブ|ブーツ|シールド|arma|armadura|casco|guantes|botas|escudo|capacete|luvas|อาวุธ|เกราะ|หมวก|ถุงมือ|รองเท้า|โล่)[:\s]+.*(?:increased|reduced|%|\+|to|\u0443величение|\u0443меньшение|증가|감소|增加|減少)/i;

/** Fallback pattern to match Item Class lines across all languages (used when primary ClientStrings miss a variant). */
export const ITEM_CLASS_PATTERN =
  /^(?:Item Class|Класс предмета|아이템 종류|物品種類|物品類別|物品类别|Gegenstandsklasse|Classe d'objet|アイテムクラス|Clase de objeto|Classe (?:do|de) Item|ประเภทไอเท็ม|ประเภทไอเทม|ชนิดไอเทม)[：:]\s*/;

/** Fallback pattern to match Item Level lines across all languages. */
export const ITEM_LEVEL_PATTERN =
  /^(?:Item Level|Уровень предмета|아이템 레벨|物品等級|物品等级|Gegenstandsstufe|Niveau de l'objet|アイテムレベル|Nivel (?:del? )?objeto|Nível do Item|เลเวลไอเท็ม|เลเวลไอเทม)[：:]\s*(\d+)/;

/** Pattern to match rune section headers across all supported languages. */
export const RUNE_SECTION_HEADER_PATTERN =
  /^(?:Rune|Socketed Runes?|Вставленные руны|Руна|Eingesetzte Runen?|Rune[s]? (?:insérées?|sertie)|ルーン|장착된 룬|鑲嵌的符文|镶嵌的符文|Runa[s]? (?:engarzada|Encaixada)|รูนที่ใส่)[:\s]/i;

/** Pattern to match gem Reservation lines (Spirit Gems). */
export const GEM_RESERVATION_PATTERN =
  /^(?:Reservation|Резервирование|Резерв|예약|保留|Reservierung|Réservation|リザーブ|Reserva|Reserva|สำรอง)[:\s]+(\d+)\s*(?:Spirit|духа|Geist|esprit|espíritu|espírito|スピリット|정신력|靈魂|灵魂|จิตวิญญาณ)/i;

/** Pattern to match gem Experience lines. */
export const GEM_EXPERIENCE_PATTERN =
  /^(?:Experience|Опыт|경험치|經驗|经验|Erfahrung|Expérience|経験値|Experiencia|Experiência|ค่าประสบการณ์)[:\s]+(\d[\d,/]+)/i;

/** Pattern to match map property lines (waystones). */
export const MAP_TIER_PATTERN =
  /^(?:Map Tier|Уровень карты|지도 등급|地圖階級|地图阶级|Kartenstufe|Palier de carte|マップティア|Nivel (?:del? )?mapa|Nível do Mapa|ระดับแผนที่)[:\s]+(\d+)/i;

export const MAP_ITEM_QUANTITY_PATTERN =
  /^(?:Item Quantity|Количество предметов|아이템 수량|物品數量|物品数量|Gegenstandsmenge|Quantité d'objets|アイテム数量|Cantidad de objetos|Quantidade de Itens|จำนวนไอเทม)[:\s]+([+-]?\d+)%/i;

export const MAP_ITEM_RARITY_PATTERN =
  /^(?:Item Rarity|Редкость предметов|아이템 희귀도|物品稀有度|Gegenstandsseltenheit|Rareté des objets|アイテムレアリティ|Rareza de objetos|Raridade de Itens|ความหายากไอเทม)[:\s]+([+-]?\d+)%/i;

export const MAP_PACK_SIZE_PATTERN =
  /^(?:Monster Pack Size|Размер группы монстров|몬스터 무리 크기|怪物群大小|Monstergruppengröße|Taille de groupe de monstres|モンスターパックサイズ|Tamaño de grupo de monstruos|Tamanho do Grupo de Monstros|ขนาดกลุ่มมอนสเตอร์)[:\s]+([+-]?\d+)%/i;

/** Pattern to match charm charge consumption lines. */
export const CHARM_CHARGES_PATTERN =
  /^(?:Consumes|Потребляет|소모|消耗|Verbraucht|Consomme|消費する|Consume|Consome|ใช้)\s+\d+/i;

/**
 * Pattern to match Crit Chance header stat lines across all languages.
 * Handles both abbreviated and full forms (e.g., Russian abbreviated vs full).
 */
export const CRIT_CHANCE_STAT_PATTERN =
  /^(?:Critical Strike Chance|Шанс крит(?:\.|ического) удара|치명타 확률|暴擊率|暴击率|Kritische Trefferchance|Chances de coup critique|クリティカル率|Probabilidad de impacto crítico|Chance de Acerto Crítico|โอกาสคริติคอล)[：:]/i;

/**
 * Pattern to match Attacks per Second header stat lines across all languages.
 * Handles alternate forms (e.g., Russian "Время между атаками").
 */
export const ATTACK_SPEED_STAT_PATTERN =
  /^(?:Attacks per Second|Атак в секунду|Время между атаками|초당 공격 횟수|每秒攻擊次數|每秒攻击次数|Angriffe pro Sekunde|Attaques par seconde|毎秒攻撃回数|Ataques por segundo|Ataques por Segundo|จำนวนครั้งการโจมตีต่อวินาที)[：:]/i;

/**
 * Alternate rarity values for languages with gender variants or transliterations.
 * Maps ItemRarity string to array of alternate values to check.
 */
export const RARITY_ALTERNATES: Record<string, string[]> = {
  Rare: ['Rara', '레어', 'แรร์'],
  Magic: ['Mágica', '매직'],
  Unique: ['Única'],
};

/** Pattern to match gem-class item class strings across all languages. */
export const ITEM_CLASS_GEM_PATTERN = /gem|寶石|宝石/i;

/** Pattern to match flask-class item class strings across all languages. */
export const ITEM_CLASS_FLASK_PATTERN = /flask|药剂|藥劑/i;

/** Pattern to match charm-class item class strings across all languages. */
export const ITEM_CLASS_CHARM_PATTERN = /charm|魔符|護符/i;

/** Pattern to match map/waystone/logbook item class strings across all languages. */
export const ITEM_CLASS_MAP_PATTERN = /waystone|map|logbook|地圖|地图|航海日誌|航海日志/i;

/** Pattern to match socketable item class strings across all languages. */
export const ITEM_CLASS_SOCKETABLE_PATTERN = /socketable|插槽物品|鑲嵌物/i;

/**
 * Single-word item type identifiers that appear alone in a section.
 * These are weapon/item categories and should not be parsed as mods.
 */
export const ITEM_TYPE_IDENTIFIERS = new Set([
  // English
  'Focus',
  'Wand',
  'Staff',
  'Quarterstaff',
  'Mace',
  'Flail',
  'Spear',
  'Crossbow',
  'Bow',
  'Map',
  'Dagger',
  'Claw',
  'Sword',
  'Axe',
  'Sceptre',
  // German
  'Zauberstab',
  'Stab',
  'Streitkolben',
  'Flegel',
  'Speer',
  'Armbrust',
  'Bogen',
  'Karte',
  // French
  'Baguette',
  'Bâton',
  'Masse',
  'Fléau',
  'Lance',
  'Arbalète',
  'Arc',
  'Carte',
  // Spanish
  'Varita',
  'Bastón',
  'Maza',
  'Mangual',
  'Lanza',
  'Ballesta',
  'Arco',
  'Mapa',
  // Portuguese
  'Bordão',
  'Cajado',
  'Maça',
  'Mangual',
  'Lança',
  'Besta',
  // Russian
  'Фокус',
  'Жезл',
  'Посох',
  'Боевой посох',
  'Булава',
  'Цеп',
  'Копьё',
  'Арбалет',
  'Лук',
  'Карта',
  // Japanese
  'ワンド',
  'スタッフ',
  'メイス',
  'クロスボウ',
  // Korean
  '완드',
  '지팡이',
  '철퇴',
  '도리깨',
  '창',
  '석궁',
  '활',
  '지도',
  // Chinese
  '法杖',
  '長杖',
  '錘',
  '連枷',
  '長矛',
  '弩',
  '弓',
  '地圖',
]);

/** Mod type markers across all supported PoE2 languages. */
export const MOD_MARKERS = {
  implicit:
    /\((?:implicit|implizit|неявный|неотъемлемый|implicite|implícito|고유|고정|固定|โดยกำเนิด)\)$/i,
  rune: /\((?:rune|руна|runa|룬|ルーン|符文|รูน)\)$/i,
  enchant:
    /\((?:enchant|Verzauberung|зачарование|enchantement|encantamiento|encantamento|인챈트|エンチャント|附魔|เอ็นแชนท์)\)$/i,
  crafted:
    /\((?:crafted|hergestellt|создано|forgé|fabricado|criado|제작|クラフト|製作|制作|คราฟต์)\)$/i,
  fractured: /\(fractured\)$/i,
  desecrated: /\(desecrated\)$/i,
} as const;

/** Augmented value marker. */
export const AUGMENTED_MARKER = /\(augmented\)/i;

/** Unmet requirement marker. */
export const UNMET_MARKER = /\(unmet\)/i;
