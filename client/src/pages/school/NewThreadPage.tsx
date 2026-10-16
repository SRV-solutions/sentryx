import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Send, Search } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { useSchool } from '../../school/SchoolContext';
import { Avatar, Field, PageHeader, Skeleton, useToast, Empty } from '../../ui';
import type { Contact, Paginated } from '../../school/types';

interface StudentLite { id: number; firstName: string; lastName: string; Enrollments?: Array<{ Division?: { name: string } }> }

/**
 * Nuevo mensaje en 3 pasos: ¿sobre qué alumno? → ¿a quién? → mensaje.
 * Familias: eligen entre docentes, preceptoría y conducción del nivel de su hijo.
 * Personal: busca al alumno y elige a qué familiar escribir.
 */
export default function NewThreadPage() {
  const { session } = useSchool();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [studentId, setStudentId] = useState<number | null>(Number(params.get('alumno')) || null);
  const [recipientId, setRecipientId] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');

  const isGuardianFlow = !!session?.isGuardian && !session?.isStaff;

  const children = useQuery({
    queryKey: ['my-children'],
    queryFn: () => apiGet<StudentLite[]>('/school/my-children'),
    enabled: !!session?.isGuardian,
  });
  const students = useQuery({
    queryKey: ['students-search', search],
    queryFn: () => apiGet<Paginated<StudentLite>>(`/school/students?q=${encodeURIComponent(search)}&limit=15`),
    enabled: !!session?.isStaff && search.trim().length >= 2,
  });
  const contacts = useQuery({
    queryKey: ['contacts', studentId],
    queryFn: () => apiGet<Contact[]>(`/school/threads/contacts?studentId=${studentId}`),
    enabled: !!studentId,
  });

  const create = useMutation({
    mutationFn: () => apiSend<{ id: number }>('POST', '/school/threads', { studentId, recipientId, subject, body }),
    onSuccess: (t) => navigate(`/mensajes/${t.id}`, { replace: true }),
    onError: (e: Error) => toast(e.message, true),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (studentId && recipientId && subject.trim().length >= 2 && body.trim()) create.mutate();
  };

  const studentOptions: StudentLite[] = [...(children.data ?? []), ...(isGuardianFlow ? [] : students.data?.data ?? [])];

  return (
    <form className="stack-lg page-narrow" style={{ margin: '0 auto', width: '100%' }} onSubmit={submit}>
      <PageHeader title="Nuevo mensaje" />

      <section className="card card-pad stack">
        <h2 className="h3">1. ¿Sobre qué alumno?</h2>
        {session?.isStaff && (
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: 14 }} className="muted" />
            <input className="input" style={{ paddingLeft: 42 }} placeholder="Buscar alumno por nombre o DNI" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
        {(children.isLoading || students.isFetching) && <Skeleton count={2} h={44} />}
        <div className="chips" style={{ flexWrap: 'wrap' }}>
          {studentOptions.map((s) => (
            <button type="button" key={s.id} className={`chip ${studentId === s.id ? 'active' : ''}`} onClick={() => (setStudentId(s.id), setRecipientId(null))}>
              {s.firstName} {s.lastName}
              {s.Enrollments?.[0]?.Division && <span className="muted"> · {s.Enrollments[0].Division.name}</span>}
            </button>
          ))}
        </div>
      </section>

      {studentId && (
        <section className="card card-pad stack">
          <h2 className="h3">2. ¿A quién le escribís?</h2>
          {contacts.isLoading && <Skeleton count={3} h={52} />}
          {contacts.data && !contacts.data.length && <Empty title="No hay destinatarios disponibles" />}
          <div className="list">
            {contacts.data?.map((c) => (
              <label key={c.userId} className="list-item" style={{ cursor: 'pointer', borderRadius: 12, background: recipientId === c.userId ? 'var(--info-bg)' : undefined }}>
                <input type="radio" name="recipient" checked={recipientId === c.userId} onChange={() => setRecipientId(c.userId)} style={{ accentColor: 'var(--primary)', width: 18, height: 18 }} />
                <Avatar name={c.name} src={c.avatar} size="sm" />
                <div className="grow">
                  <div className="h3">{c.name}</div>
                  <div className="xs muted">{[c.role, c.detail].filter(Boolean).join(' · ')}</div>
                </div>
              </label>
            ))}
          </div>
        </section>
      )}

      {recipientId && (
        <section className="card card-pad stack">
          <h2 className="h3">3. Mensaje</h2>
          <Field label="Asunto">
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} placeholder="Ej: Consulta sobre la tarea de Matemática" />
          </Field>
          <Field label="Mensaje">
            <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={6} />
          </Field>
          <button className="btn btn-accent btn-block" disabled={create.isPending || subject.trim().length < 2 || !body.trim()}>
            <Send size={18} /> Enviar
          </button>
        </section>
      )}
    </form>
  );
}
