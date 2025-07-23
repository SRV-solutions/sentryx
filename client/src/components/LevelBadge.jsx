import { Box, Typography } from '@mui/material';
import { styled } from '@mui/system';

const ProgressCircle = styled('div')(({ percent, color }) => ({
  position: 'relative',
  width: 100,
  height: 100,
  borderRadius: '50%',
  background: `conic-gradient(${color} ${percent * 3.6}deg, #e0e0e0 0deg)`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 0 10px rgba(0,0,0,0.2)',
}));

const InnerCircle = styled('div')({
  width: 75,
  height: 75,
  borderRadius: '50%',
  backgroundColor: '#fff',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
});

const LevelBadge = ({ points = 0, level = 1 }) => {
  const maxPoints = 100;
  const percentage = Math.min((points % maxPoints), 100);

  const getColorByLevel = (level) => {
    if (level < 3) return '#aaa';
    if (level < 5) return '#2196f3';
    if (level < 8) return '#4caf50';
    if (level < 12) return '#ffc107';
    return '#f44336';
  };

  const color = getColorByLevel(level);

  return (
    <Box display="flex" flexDirection="column" alignItems="center">
      <ProgressCircle percent={percentage} color={color}>
        <InnerCircle>
          <Typography variant="subtitle2" fontWeight="bold">Lvl</Typography>
          <Typography variant="h6" fontWeight="bold">{level}</Typography>
        </InnerCircle>
      </ProgressCircle>
      <Typography variant="body2" mt={1}>{points % 100}/100 pts</Typography>
    </Box>
  );
};

export default LevelBadge;
