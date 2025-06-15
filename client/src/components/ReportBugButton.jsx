// src/components/ReportBugButton.jsx
import { useLocation } from 'react-router-dom';
import { Fab, Tooltip } from '@mui/material';
import BugReportIcon from '@mui/icons-material/BugReport';

const ReportBugButton = ({ onClick }) => {
    const location = useLocation();

    // Evita que aparezca en la página de login
    if (location.pathname === '/login') return null;

    return (
        <Tooltip title="Reportar un problema">
            <Fab
                color="error"
                onClick={onClick}
                sx={{
                    position: 'fixed',
                    bottom: 24,
                    right: 24,
                    zIndex: 9999,
                }}
            >
                <BugReportIcon />
            </Fab>
        </Tooltip>
    );
};

export default ReportBugButton;
