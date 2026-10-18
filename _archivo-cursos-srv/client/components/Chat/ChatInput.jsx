import { Box, TextField, Button } from '@mui/material';
import styles from './ChatSolvix.module.css';

const ChatInput = ({ input, setInput, sendMessage, loading, handleKeyDown, darkMode }) => (

    <Box className={styles.inputArea} sx={{ mt: 1 }}>
        <TextField
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            multiline
            fullWidth
            rows={2}
            placeholder="Escribe tu mensaje..."
            disabled={loading}
            sx={{
                textarea: {
                    color: darkMode ? '#f1f1f1' : '#000',
                },
                '& .MuiOutlinedInput-root': {
                    backgroundColor: darkMode ? '#2c2c2c' : '#fff',
                    '& fieldset': {
                        borderColor: darkMode ? '#555' : '#ccc',
                    },
                    '&:hover fieldset': {
                        borderColor: darkMode ? '#777' : '#888',
                    },
                },
                '& .MuiInputLabel-root': {
                    color: darkMode ? '#bbb' : '#000',
                },
            }}
        />
        <Button
            variant="contained"
            onClick={sendMessage}
            disabled={loading}
            sx={{
                ml: 2,
                bgcolor: darkMode ? '#1976d2' : undefined,
                '&:hover': {
                    bgcolor: darkMode ? '#1565c0' : undefined,
                },
            }}
        >
            Enviar
        </Button>
    </Box>
);

export default ChatInput;
