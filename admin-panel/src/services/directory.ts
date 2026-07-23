import api from './api';

export interface DirectoryUser {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  specialties?: string[];
}

// Süreç içi önbellek: aynı ID'ler için tekrar tekrar istek atmayı önler.
const cache = new Map<string, DirectoryUser>();

export const fullName = (u?: DirectoryUser) => (u ? `${u.firstName} ${u.lastName}` : undefined);

// Verilen ID listesindeki kullanıcıları {id -> DirectoryUser} olarak döner.
// Önbellekte olmayanlar tek istekte toplu çekilir.
export async function fetchUsersByIds(ids: (string | undefined | null)[]): Promise<Map<string, DirectoryUser>> {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => !!id)));
  const missing = uniqueIds.filter((id) => !cache.has(id));

  if (missing.length > 0) {
    try {
      const res = await api.get<DirectoryUser[]>('/auth/directory', { params: { ids: missing.join(',') } });
      res.data.forEach((u) => cache.set(u.id, u));
    } catch (err) {
      console.error('Kullanıcı dizini alınamadı:', err);
    }
  }

  const result = new Map<string, DirectoryUser>();
  uniqueIds.forEach((id) => {
    const u = cache.get(id);
    if (u) result.set(id, u);
  });
  return result;
}

// Belirli bir role sahip tüm kullanıcıları döner (örn. atama için temsilci listesi).
export async function fetchUsersByRole(role: string): Promise<DirectoryUser[]> {
  const res = await api.get<DirectoryUser[]>('/auth/directory', { params: { role } });
  res.data.forEach((u) => cache.set(u.id, u));
  return res.data;
}
