import { useState } from 'react';
import { Typography, Link, Collapse } from '@mui/material';

const DescriptionPreview = ({ text, maxLength = 30, showExpanded = true }) => {
  const [expanded, setExpanded] = useState(false);

  if (!text) return <Typography variant="body2" color="text.secondary">Sin descripción disponible.</Typography>;

  const shouldTruncate = text.length > maxLength;

  return (
    <>
      <Typography variant="body2" color="text.secondary" component="span">
        {shouldTruncate && !expanded ? text.substring(0, maxLength) + '...' : text}
      </Typography>
      {(showExpanded && shouldTruncate) && (
        <Link
          component="button"
          variant="body2"
          onClick={() => setExpanded(!expanded)}
          sx={{ ml: 1 }}
        >
          {expanded ? 'Mostrar menos' : 'Mostrar más'}
        </Link>
      )}
    </>
  );
};

export default DescriptionPreview