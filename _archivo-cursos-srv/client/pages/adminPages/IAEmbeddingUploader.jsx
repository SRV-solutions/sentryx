import {
    Container,
    Typography,
    TextField,
    Button,
    Snackbar,
    Alert,
    Box,
} from "@mui/material";
import { useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from '../../context/AuthContext'
const apiUrl = import.meta.env.VITE_API_URL;

const IAEmbeddingUploader = () => {
    const { darkMode } = useTheme();
    const [token, setToken] = useState("");
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    const { authFetch } = useAuth();

    const [snackbar, setSnackbar] = useState({
        open: false,
        message: "",
        severity: "info",
    });

    const handleSubmit = async () => {
        if (!content) {
            setSnackbar({
                open: true,
                message: "Por favor completá todos los campos.",
                severity: "warning",
            });
            return;
        }

        setLoading(true);

        try {
            const response = await authFetch(`${apiUrl}/embedding/upload`, {
                method: "POST",
                body: JSON.stringify({ content }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data?.message || "Error al enviar contenido.");
            }

            setSnackbar({
                open: true,
                message: "✅ Contenido enviado con éxito",
                severity: "success",
            });

            setToken("");
            setContent("");
        } catch (error) {
            setSnackbar({
                open: true,
                message: `❌ ${error.message}`,
                severity: "error",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Container maxWidth="md" sx={{ py: 5 }}>
            <Typography variant="h4" gutterBottom>
                Nutrir a Solvix (IA)
            </Typography>

            <Box display="flex" flexDirection="column" gap={3}>
        
                <TextField
                    label="Contenido para entrenar la IA"
                    variant="outlined"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    multiline
                    rows={8}
                    fullWidth
                    required
                />
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSubmit}
                    disabled={loading}
                >
                    {loading ? "Enviando..." : "Nutrir IA"}
                </Button>
            </Box>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={5000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                    severity={snackbar.severity}
                    sx={{ width: "100%" }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Container>
    );
};

export default IAEmbeddingUploader;
