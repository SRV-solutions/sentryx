import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Avatar, Sheet } from '../../ui';

interface ChatUser { id: number; firstName: string; lastName: string; username?: string; avatar?: string | null }
interface Props { chat: { id: number; title?: string; type: 'PRIVATE' | 'GROUP' | 'AI'; Users?: ChatUser[] }; meId: number }

/**
 * Encabezado del chat de la comunidad SRV. Privado: lleva al perfil del otro.
 * Grupo: abre la lista de integrantes y cada uno lleva a su perfil.
 */
export default function ChatHeader({ chat, meId }: Props) {
  const [open, setOpen] = useState(false);
  if (chat.type === 'AI') return null;
  const users = chat.Users ?? [];
  const others = users.filter((u) => u.id !== meId);
  const name = (u: ChatUser) => `${u.firstName} ${u.lastName}`;
  const group = chat.type === 'GROUP';
  const title = group ? chat.title || 'Grupo' : others[0] ? name(others[0]) : 'Chat';

  const inner = (
    <>
      <Avatar name={title} src={group ? null : others[0]?.avatar} size="sm" />
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="h3 truncate" style={{ display: 'block' }}>{title}</span>
        <span className="xs muted truncate" style={{ display: 'block' }}>
          {group ? `${users.length} integrantes · ${others.map((u) => u.firstName).join(', ')}` : others[0]?.username ? `@${others[0].username} · Ver perfil` : 'Ver perfil'}
        </span>
      </span>
      <ChevronRight size={16} className="muted" />
    </>
  );

  return (
    <>
      {group ? (
        <button className="list-item list-button" style={{ padding: '10px 12px' }} onClick={() => setOpen(true)}>{inner}</button>
      ) : others[0] ? (
        <Link to={`/perfil/${others[0].id}`} className="list-item" style={{ padding: '10px 12px', color: 'inherit' }}>{inner}</Link>
      ) : null}
      <Sheet open={open} onClose={() => setOpen(false)} title={`Integrantes (${users.length})`}>
        <div className="card list" style={{ overflow: 'hidden' }}>
          {users.map((u) => (
            <Link key={u.id} to={u.id === meId ? '/perfil/me' : `/perfil/${u.id}`} className="list-item" onClick={() => setOpen(false)}>
              <Avatar name={name(u)} src={u.avatar} />
              <span className="grow">
                <span className="h3" style={{ display: 'block' }}>{name(u)}{u.id === meId ? ' (vos)' : ''}</span>
                {u.username && <span className="xs muted">@{u.username}</span>}
              </span>
              <ChevronRight size={16} className="muted" />
            </Link>
          ))}
        </div>
      </Sheet>
    </>
  );
}
