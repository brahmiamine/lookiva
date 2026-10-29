// Stable reference data (code, not per-user rows). Codes are API values and never change; labels may be reworded.
// No category is defined by gender.
export type Labels = { fr: string; en: string; ar: string };
const L = (fr: string, en: string, ar: string): Labels => ({ fr, en, ar });

export type Category = { code: string; labels: Labels; subtypes: { code: string; labels: Labels }[] };

const cat = (code: string, labels: Labels, subs: [string, string, string, string][]): Category => ({
  code,
  labels,
  subtypes: subs.map(([c, fr, en, ar]) => ({ code: c, labels: L(fr, en, ar) })),
});

export const CATEGORIES: readonly Category[] = [
  cat('TOPS', L('Hauts', 'Tops', 'قمصان وبلوزات'), [
    ['TSHIRT', 'T-shirt', 'T-shirt', 'تيشيرت'],
    ['SHIRT', 'Chemise', 'Shirt', 'قميص'],
    ['BLOUSE', 'Blouse', 'Blouse', 'بلوزة'],
    ['POLO', 'Polo', 'Polo shirt', 'بولو'],
    ['TANK_TOP', 'Débardeur', 'Tank top', 'قميص بلا أكمام'],
    ['TUNIC', 'Tunique', 'Tunic', 'تونيك'],
    ['CROP_TOP', 'Haut court', 'Crop top', 'قميص قصير'],
  ]),
  cat('KNITWEAR', L('Mailles', 'Knitwear', 'ملابس صوفية'), [
    ['SWEATER', 'Pull', 'Sweater', 'سترة صوفية'],
    ['CARDIGAN', 'Gilet', 'Cardigan', 'كارديغان'],
    ['HOODIE', 'Sweat à capuche', 'Hoodie', 'هودي'],
    ['SWEATSHIRT', 'Sweat-shirt', 'Sweatshirt', 'سويت شيرت'],
    ['TURTLENECK', 'Col roulé', 'Turtleneck', 'ياقة عالية'],
  ]),
  cat('BOTTOMS', L('Bas', 'Bottoms', 'سراويل وتنانير'), [
    ['JEANS', 'Jean', 'Jeans', 'جينز'],
    ['TROUSERS', 'Pantalon', 'Trousers', 'بنطال'],
    ['CHINOS', 'Chino', 'Chinos', 'شينو'],
    ['SHORTS', 'Short', 'Shorts', 'شورت'],
    ['SKIRT', 'Jupe', 'Skirt', 'تنورة'],
    ['LEGGINGS', 'Legging', 'Leggings', 'ليغينغ'],
    ['JOGGERS', 'Jogging', 'Joggers', 'بنطال رياضي'],
    ['CARGO_PANTS', 'Pantalon cargo', 'Cargo pants', 'بنطال كارغو'],
  ]),
  cat('ONE_PIECE', L('Une pièce', 'One-piece', 'قطعة واحدة'), [
    ['DRESS', 'Robe', 'Dress', 'فستان'],
    ['JUMPSUIT', 'Combinaison', 'Jumpsuit', 'بدلة قطعة واحدة'],
    ['OVERALLS', 'Salopette', 'Overalls', 'أفرول'],
    ['SUIT', 'Costume', 'Suit', 'بدلة رسمية'],
  ]),
  cat('OUTERWEAR', L('Vestes et manteaux', 'Outerwear', 'معاطف وجاكيتات'), [
    ['JACKET', 'Veste', 'Jacket', 'جاكيت'],
    ['BLAZER', 'Blazer', 'Blazer', 'بليزر'],
    ['COAT', 'Manteau', 'Coat', 'معطف'],
    ['PARKA', 'Parka', 'Parka', 'باركا'],
    ['RAINCOAT', 'Imperméable', 'Raincoat', 'معطف المطر'],
    ['WINDBREAKER', 'Coupe-vent', 'Windbreaker', 'جاكيت واقٍ من الرياح'],
    ['PUFFER', 'Doudoune', 'Puffer jacket', 'جاكيت منفوخ'],
    ['VEST', 'Gilet sans manches', 'Vest', 'سترة بلا أكمام'],
  ]),
  cat('FOOTWEAR', L('Chaussures', 'Footwear', 'أحذية'), [
    ['SNEAKERS', 'Baskets', 'Sneakers', 'حذاء رياضي'],
    ['BOOTS', 'Bottes', 'Boots', 'جزمة'],
    ['ANKLE_BOOTS', 'Bottines', 'Ankle boots', 'جزمة قصيرة'],
    ['LOAFERS', 'Mocassins', 'Loafers', 'موكاسين'],
    ['DRESS_SHOES', 'Chaussures de ville', 'Dress shoes', 'حذاء رسمي'],
    ['SANDALS', 'Sandales', 'Sandals', 'صندل'],
    ['HEELS', 'Talons', 'Heels', 'حذاء بكعب'],
    ['FLATS', 'Ballerines', 'Flats', 'حذاء مسطح'],
    ['SLIPPERS', 'Chaussons', 'Slippers', 'خف'],
  ]),
  cat('ACCESSORIES', L('Accessoires', 'Accessories', 'إكسسوارات'), [
    ['BELT', 'Ceinture', 'Belt', 'حزام'],
    ['SCARF', 'Écharpe', 'Scarf', 'وشاح'],
    ['HIJAB', 'Voile', 'Headscarf', 'حجاب'],
    ['HAT', 'Chapeau', 'Hat', 'قبعة'],
    ['CAP', 'Casquette', 'Cap', 'كاب'],
    ['BEANIE', 'Bonnet', 'Beanie', 'قبعة صوفية'],
    ['GLOVES', 'Gants', 'Gloves', 'قفازات'],
    ['TIE', 'Cravate', 'Tie', 'ربطة عنق'],
    ['SUNGLASSES', 'Lunettes de soleil', 'Sunglasses', 'نظارات شمسية'],
    ['JEWELRY', 'Bijou', 'Jewelry', 'مجوهرات'],
    ['WATCH', 'Montre', 'Watch', 'ساعة'],
    ['SOCKS', 'Chaussettes', 'Socks', 'جوارب'],
  ]),
  cat('BAGS', L('Sacs', 'Bags', 'حقائب'), [
    ['HANDBAG', 'Sac à main', 'Handbag', 'حقيبة يد'],
    ['BACKPACK', 'Sac à dos', 'Backpack', 'حقيبة ظهر'],
    ['SHOULDER_BAG', 'Sac bandoulière', 'Shoulder bag', 'حقيبة كتف'],
    ['TOTE', 'Cabas', 'Tote bag', 'حقيبة توت'],
    ['CLUTCH', 'Pochette', 'Clutch', 'كلتش'],
    ['TRAVEL_BAG', 'Sac de voyage', 'Travel bag', 'حقيبة سفر'],
  ]),
  cat('SPORTSWEAR', L('Sport', 'Sportswear', 'ملابس رياضية'), [
    ['SPORTS_TOP', 'Haut de sport', 'Sports top', 'قميص رياضي'],
    ['SPORTS_BOTTOM', 'Bas de sport', 'Sports bottoms', 'سروال رياضي'],
    ['TRACKSUIT', 'Survêtement', 'Tracksuit', 'بدلة رياضية'],
    ['SWIMWEAR', 'Maillot de bain', 'Swimwear', 'ملابس سباحة'],
    ['RUNNING_SHOES', 'Chaussures de course', 'Running shoes', 'حذاء جري'],
  ]),
  cat('TRADITIONAL', L('Tenues traditionnelles', 'Traditional wear', 'ملابس تقليدية'), [
    ['DJELLABA', 'Djellaba', 'Djellaba', 'جلابة'],
    ['KAFTAN', 'Caftan', 'Kaftan', 'قفطان'],
    ['GANDOURA', 'Gandoura', 'Gandoura', 'قندورة'],
    ['ABAYA', 'Abaya', 'Abaya', 'عباءة'],
    ['THOBE', 'Thobe', 'Thobe', 'ثوب'],
    ['KARAKOU', 'Karakou', 'Karakou', 'كراكو'],
    ['BURNOUS', 'Burnous', 'Burnous', 'برنوس'],
    ['BABOUCHES', 'Babouches', 'Babouche slippers', 'بلغة'],
  ]),
  cat('UNDERWEAR_SLEEP', L('Sous-vêtements et nuit', 'Underwear and sleepwear', 'ملابس داخلية ونوم'), [
    ['UNDERWEAR', 'Sous-vêtement', 'Underwear', 'ملابس داخلية'],
    ['PAJAMAS', 'Pyjama', 'Pajamas', 'بيجاما'],
    ['ROBE', 'Peignoir', 'Robe', 'روب'],
    ['THERMAL', 'Sous-couche thermique', 'Thermal base layer', 'طبقة حرارية'],
  ]),
];

export const SUBTYPE_CATEGORY: ReadonlyMap<string, string> = new Map(CATEGORIES.flatMap((c) => c.subtypes.map((s) => [s.code, c.code] as const)));
export const CATEGORY_CODES = CATEGORIES.map((c) => c.code) as [string, ...string[]];
export const SUBTYPE_CODES = [...SUBTYPE_CATEGORY.keys()] as [string, ...string[]];

export const categoryOfSubtype = (subtype: string): string | undefined => SUBTYPE_CATEGORY.get(subtype);

export type Color = { code: string; hex: string; labels: Labels };
const col = (code: string, hex: string, fr: string, en: string, ar: string): Color => ({ code, hex, labels: L(fr, en, ar) });

export const COLORS: readonly Color[] = [
  col('BLACK', '#111111', 'Noir', 'Black', 'أسود'),
  col('WHITE', '#FFFFFF', 'Blanc', 'White', 'أبيض'),
  col('GREY', '#8A8D91', 'Gris', 'Grey', 'رمادي'),
  col('BEIGE', '#D9C7A3', 'Beige', 'Beige', 'بيج'),
  col('BROWN', '#6B4A2F', 'Marron', 'Brown', 'بني'),
  col('RED', '#C62828', 'Rouge', 'Red', 'أحمر'),
  col('ORANGE', '#EF6C00', 'Orange', 'Orange', 'برتقالي'),
  col('YELLOW', '#F9C80E', 'Jaune', 'Yellow', 'أصفر'),
  col('GREEN', '#2E7D32', 'Vert', 'Green', 'أخضر'),
  col('KHAKI', '#7A7A3E', 'Kaki', 'Khaki', 'كاكي'),
  col('BLUE', '#1E6FD9', 'Bleu', 'Blue', 'أزرق'),
  col('NAVY', '#1B2A4A', 'Bleu marine', 'Navy', 'أزرق داكن'),
  col('PURPLE', '#6A3FA0', 'Violet', 'Purple', 'بنفسجي'),
  col('PINK', '#EC7FA9', 'Rose', 'Pink', 'وردي'),
  col('BURGUNDY', '#7B1E3A', 'Bordeaux', 'Burgundy', 'عنابي'),
  col('MULTICOLOR', '#FFFFFF', 'Multicolore', 'Multicolor', 'متعدد الألوان'),
];
export const COLOR_CODES = COLORS.map((c) => c.code) as [string, ...string[]];

export const SHADES: readonly { code: string; labels: Labels }[] = [
  { code: 'LIGHT', labels: L('Clair', 'Light', 'فاتح') },
  { code: 'MEDIUM', labels: L('Moyen', 'Medium', 'متوسط') },
  { code: 'DARK', labels: L('Foncé', 'Dark', 'داكن') },
];
export const SHADE_CODES = SHADES.map((s) => s.code) as [string, ...string[]];

export const SEASONS: readonly { code: string; labels: Labels }[] = [
  { code: 'SPRING', labels: L('Printemps', 'Spring', 'الربيع') },
  { code: 'SUMMER', labels: L('Été', 'Summer', 'الصيف') },
  { code: 'AUTUMN', labels: L('Automne', 'Autumn', 'الخريف') },
  { code: 'WINTER', labels: L('Hiver', 'Winter', 'الشتاء') },
];
export const SEASON_CODES = SEASONS.map((s) => s.code) as [string, ...string[]];

export const STYLES: readonly { code: string; labels: Labels }[] = [
  { code: 'CASUAL', labels: L('Décontracté', 'Casual', 'كاجوال') },
  { code: 'SMART_CASUAL', labels: L('Chic décontracté', 'Smart casual', 'أنيق غير رسمي') },
  { code: 'FORMAL', labels: L('Formel', 'Formal', 'رسمي') },
  { code: 'BUSINESS', labels: L('Professionnel', 'Business', 'عمل') },
  { code: 'SPORT', labels: L('Sportif', 'Sporty', 'رياضي') },
  { code: 'STREETWEAR', labels: L('Streetwear', 'Streetwear', 'ستريت') },
  { code: 'TRADITIONAL', labels: L('Traditionnel', 'Traditional', 'تقليدي') },
  { code: 'EVENING', labels: L('Soirée', 'Evening', 'سهرة') },
  { code: 'HOME', labels: L('Maison', 'Home', 'منزلي') },
];
export const STYLE_CODES = STYLES.map((s) => s.code) as [string, ...string[]];
