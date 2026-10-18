// TypingIndicator.jsx
import { Box, Paper, Typography } from '@mui/material';

const Dot = ({ delay = '0s' }) => (
    <Box
        component="span"
        sx={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: '#999',
            animation: 'dotPulse 1s infinite',
            animationDelay: delay,
            '@keyframes dotPulse': {
                '0%': { transform: 'scale(1)', opacity: 1 },
                '50%': { transform: 'scale(1.5)', opacity: 0.6 },
                '100%': { transform: 'scale(1)', opacity: 1 },
            }
        }}
    />
);

const TypingIndicator = ({ darkMode }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Typography variant="caption">Solvix</Typography>
        <Paper sx={{ p: 2, bgcolor: darkMode ? '#333' : '#e0e0e0' }}>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Dot />
                <Dot delay="0.2s" />
                <Dot delay="0.4s" />
            </Box>
        </Paper>
    </Box>
);

export default TypingIndicator;
