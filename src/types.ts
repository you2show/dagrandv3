
export interface TeamMember {
  name: string;
  name_cn?: string; // Optional Chinese Name
  name_km?: string; // Optional Khmer Name
  role: string;
  role_cn?: string;
  role_km?: string;
  languages: string;
  languages_cn?: string;
  languages_km?: string;
  bio: string[];
  bio_cn?: string[]; // Optional Chinese Bio
  bio_km?: string[]; // Optional Khmer Bio
  education: string;
  education_cn?: string;
  education_km?: string;
  contact: {
    phone: string;
    email: string;
  };
  image: string;
}

export interface PracticeArea {
  id: string;
  title: string;
  title_cn?: string;
  title_km?: string;
  shortDescription: string;
  shortDescription_cn?: string;
  shortDescription_km?: string;
  fullContent: string[]; 
  fullContent_cn?: string[];
  fullContent_km?: string[];
  image?: string; // Added image for hover effect
}

export interface Author {
  id: string;
  name: string;
  avatar: string;
  role: string;
}

export interface LegalUpdate {
  id: string;
  date: string;
  title: string;
  title_cn?: string;
  title_km?: string;
  summary: string;
  summary_cn?: string;
  summary_km?: string;
  category?: string; // Added Category field
  content: string[]; // Added full content array
  content_cn?: string[];
  content_km?: string[];
  image: string;
  authorId?: string;
  author?: Author;
}