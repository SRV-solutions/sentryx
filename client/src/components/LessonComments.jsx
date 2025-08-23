import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
    Box,
    Typography,
    TextField,
    Button,
    Paper,
    Divider,
} from '@mui/material';
import { AiFillStar, AiOutlineStar } from 'react-icons/ai';

import { MdAccountCircle } from 'react-icons/md';
import Comment from './Comment';

const apiUrl = import.meta.env.VITE_API_URL;

const LessonComments = ({ lessonId }) => {
    const { authFetch } = useAuth();
    const { darkMode } = useTheme();

    const [newRating, setNewRating] = useState(5);
    const [hoverRating, setHoverRating] = useState(0);
    const [comments, setComments] = useState([]);
    const [avgRating, setAvgRating] = useState('0.00');
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showAll, setShowAll] = useState(false);

    const loadComments = async () => {
        try {
            setLoading(true);
            const res = await authFetch(`${apiUrl}/lessons/${lessonId}/comments`);
            if (!res.ok) throw new Error('Error al cargar comentarios');
            const data = await res.json();
            setComments(data.comments);
            setAvgRating(data.avgRating);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadComments();
    }, [lessonId]);

    const submitComment = async () => {
        if (newComment.trim().length === 0) {
            setError('El comentario no puede estar vacío');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const res = await authFetch(`${apiUrl}/lessons/${lessonId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment: newComment, rating: newRating }),
            });
            if (!res.ok) throw new Error('Error al enviar comentario');
            setNewComment('');
            setNewRating(5);
            await loadComments();
        } catch (e) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const commentsToShow = showAll ? comments : comments.slice(0, 2);

    return (
        <Paper
            elevation={3}
            sx={{
                maxWidth: 800,
                margin: '2rem auto',
                padding: '2rem',
                bgcolor: darkMode ? '#1e1e1e' : '#fff',
                color: darkMode ? '#fff' : '#000',
                borderRadius: 3,
            }}
        >
            <Typography variant="h5" gutterBottom>
                Comentarios y Valoraciones
            </Typography>

            <Typography variant="subtitle1" gutterBottom>
                Promedio de estrellas:{' '}
                <strong>
                    {avgRating} <AiFillStar color="#FFD700" />
                </strong>
            </Typography>

            <Divider sx={{ my: 2 }} />
            <Typography variant="h6">Dejá tu comentario</Typography>

            <TextField
                fullWidth
                multiline
                rows={4}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Escribí tu comentario..."
                sx={{ mt: 2 }}
                disabled={submitting}
                InputProps={{
                    sx: {
                        color: darkMode ? '#fff' : '#000',
                    },
                }}
            />

            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography>Calificación:</Typography>
                <Box display="flex" gap={0.5}>
                    {[1, 2, 3, 4, 5].map((star) => (
                        <Box
                            key={star}
                            onClick={() => setNewRating(star)}
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                            sx={{ cursor: 'pointer' }}
                        >
                            {hoverRating >= star || (!hoverRating && newRating >= star) ? (
                                <AiFillStar color="#FFD700" size={28} />
                            ) : (
                                <AiOutlineStar color="#FFD700" size={28} />
                            )}
                        </Box>
                    ))}
                </Box>
            </Box>


            <Button
                variant="contained"
                onClick={submitComment}
                disabled={submitting}
                sx={{ mt: 2 }}
            >
                {submitting ? 'Enviando...' : 'Enviar comentario'}
            </Button>

            <Divider sx={{ my: 3 }} />

            {loading && <Typography>Cargando comentarios...</Typography>}
            {error && (
                <Typography color="error" gutterBottom>
                    {error}
                </Typography>
            )}
            {!loading && comments.length === 0 && (
                <Typography>No hay comentarios aún.</Typography>
            )}

            <Box mt={2}>
                {commentsToShow.map((c) => (
                    <Box
                        key={c.id}
                        mb={3}
                        p={2}
                        sx={{
                            borderRadius: 2,
                            bgcolor: darkMode ? '#2a2a2a' : '#f5f5f5',
                            boxShadow: darkMode
                                ? '0 0 8px rgba(255,255,255,0.05)'
                                : '0 0 5px rgba(0,0,0,0.05)',
                            maxWidth: "100%", // evita que se salga horizontalmente
                            overflowWrap: "break-word", // evita desbordes por palabras largas
                        }}
                    >
                        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                            <MdAccountCircle size={22} />
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                {c.User?.username || 'Anónimo'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                – {c.rating} <AiFillStar color="#FFD700" />
                            </Typography>
                        </Box>

                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                            {new Date(c.createdAt).toLocaleString()}
                        </Typography>

                        <Comment comment={c.comment} darkMode={darkMode} />
                    </Box>
                ))}
                {comments.length > 2 && (
                    <Button
                        onClick={() => setShowAll(!showAll)}
                        sx={{ mt: 1, textTransform: 'none' }}
                    >
                        {showAll ? 'Ver menos' : 'Ver más comentarios'}
                    </Button>
                )}
            </Box>
        </Paper>
    );
};

export default LessonComments;
