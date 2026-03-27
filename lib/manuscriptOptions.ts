export const CORE_FICTION_GENRES = [
  "Fantasy",
  "Science Fiction",
  "Romance",
  "Mystery",
  "Thriller",
  "Horror",
  "Historical Fiction",
  "Contemporary",
  "Literary Fiction",
  "Adventure",
  "Action",
  "Drama",
  "Satire",
  "Magical Realism",
  "Dystopian",
  "Paranormal",
  "Urban Fantasy",
  "Western",
];

export const ROMANCE_SUBGENRES = [
  "Romantic Comedy",
  "Dark Romance",
  "Paranormal Romance",
  "Historical Romance",
  "Contemporary Romance",
  "Fantasy Romance",
  "Sci Fi Romance",
];

export const MYSTERY_SUSPENSE_SUBGENRES = [
  "Crime",
  "Detective",
  "Noir",
  "Psychological Thriller",
  "Legal Thriller",
  "Political Thriller",
];

export const HORROR_SUBGENRES = [
  "Gothic",
  "Cosmic Horror",
  "Supernatural Horror",
  "Body Horror",
];

export const YOUTH_POPULAR_GENRES = [
  "YA Fantasy",
  "YA Contemporary",
  "YA Romance",
  "YA Dystopian",
  "MG Fantasy",
  "MG Adventure",
];

export const NONFICTION_CATEGORIES = [
  "Memoir",
  "Autobiography",
  "Biography",
  "Creative Nonfiction",
  "Self Help",
  "True Crime",
  "Essay Collection",
  "Narrative Nonfiction",
];

export const ALL_MANUSCRIPT_CATEGORIES = [
  ...CORE_FICTION_GENRES,
  ...ROMANCE_SUBGENRES,
  ...MYSTERY_SUSPENSE_SUBGENRES,
  ...HORROR_SUBGENRES,
  ...YOUTH_POPULAR_GENRES,
  ...NONFICTION_CATEGORIES,
];

export const YOUTH_ALLOWED_CATEGORIES = [...YOUTH_POPULAR_GENRES];

export function categoriesForAgeCategory(ageCategory: string | null | undefined) {
  if (ageCategory === "youth_13_17") {
    return YOUTH_ALLOWED_CATEGORIES;
  }
  return ALL_MANUSCRIPT_CATEGORIES;
}
