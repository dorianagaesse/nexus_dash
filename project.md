# Project Blueprint: NexusDash

## 1. Vision & Overview

NexusDash est un hub centralisé de productivité personnelle. Il permet à l'utilisateur de gérer plusieurs projets, chacun contenant un tableau Kanban spécialisé, un référentiel de ressources techniques (IPs, documents), et une intégration en direct avec Google Calendar. L'objectif est d'éliminer le changement constant d'onglets en consolidant la gestion des tâches et les données de référence techniques dans une seule vue.

## 2. Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript (Strict mode)
- **Styling**: Tailwind CSS + Shadcn/UI (Components)
- **Icons**: Lucide React
- **Drag & Drop**: `@hello-pangea/dnd`
- **Database**: PostgreSQL via Prisma ORM (Supabase-hosted in current baseline)
- **Authentication/API**: Next.js API routes + Google OAuth (Calendar integration); app auth target is DB-backed user sessions + JWT-style scoped tokens for agent/API access (planned via TASK-020/TASK-045/TASK-059)
- **File Handling**: StorageProvider abstraction with local dev fallback and Cloudflare R2 object storage target for deployed environments
- **Containerization**: Docker + Docker Compose (dev and production parity)

## 3. Core Features & Requirements

### A. Project Management (Root Level)

- Landing page affichant une grille de projets existants
- Capacité de Créer, Mettre à jour et Supprimer (CRUD) des projets
- Chaque carte de projet renvoie vers un dashboard de projet dédié

### B. The Project Dashboard (Layout)

#### 1. Top Section (Resource Header)
- Panel Collapsible/Expandable
- **Technical Info**: Table/Liste pour adresses IP VM, credentials, ou liens
- **Document Vault**: Liste de fichiers avec bouton "Preview" (PDF/Images) et "Download"

#### 2. Middle Section (Kanban Board)
- **Quatre Colonnes**: `Backlog`, `In Progress`, `Blocked`, `Done`
- **Cards**: Titre, Description, et Label avec code couleur (Badge)
- **Interactions**: Drag and Drop des cartes entre colonnes ; persistance de position en DB

#### 3. Bottom/Side Section (Google Calendar)
- Widget récupérant les événements du Google Calendar principal de l'utilisateur
- Affichage des réunions/deadlines à venir

## 4. Database Schema (Prisma)
```prisma
model Project {
  id          String   @id @default(cuid())
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  tasks       Task[]
  resources   Resource[]
}

model Task {
  id          String   @id @default(cuid())
  title       String
  description String?
  status      String   @default("Backlog") // Backlog, In Progress, Blocked, Done
  position    Int      @default(0)
  label       String?  // Couleur du badge
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Resource {
  id          String   @id @default(cuid())
  type        String   // "technical" ou "document"
  name        String
  content     String   // IP/credentials ou chemin fichier
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
}
```

## 5. UI/UX Guidelines

- **Theme**: Modern Dark Mode par défaut (utilisant les couleurs Radix)
- **Kanban Cards**: Bordures propres, ombres subtiles. En drag, la carte doit avoir un léger effet de rotation ou scale
- **Transitions**: Transitions de hauteur fluides pour la section "Expandable" des ressources
- **Labels**: Les badges doivent avoir un texte à haut contraste et un fond semi-transparent de la couleur choisie

## 6. Development Milestones (Roadmap)

1. **Phase 1**: Setup Next.js, Prisma, Tailwind, and Docker (Dockerfile + docker-compose). CRUD Project basique
2. **Phase 2**: Implémenter la logique Kanban avec `@hello-pangea/dnd` et persistance du statut
3. **Phase 3**: Créer le panel Resource Expandable et logique Upload/Preview de fichiers
4. **Phase 4**: Intégrer NextAuth et Google Calendar API
5. **Phase 5**: Polish Final (Animations, notifications Toast pour les erreurs)
