import { useState } from "react";
import { Typography, Button } from "@mui/material";

const Comment = ({ comment, darkMode }) => {
  const [expanded, setExpanded] = useState(false);
  const lineLimit = 3; // número de líneas visibles antes de "Ver más"

  return (
    <>
      <Typography
        variant="body1"
        sx={{
          fontSize: "1.1rem",
          lineHeight: 1.6,
          color: darkMode ? "#fff" : "#111",
          mt: 1,
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
          WebkitLineClamp: expanded ? "unset" : lineLimit, // controla líneas visibles
          whiteSpace: expanded ? "normal" : "normal",
        }}
      >
        {comment}
      </Typography>

      {comment.length > 150 && (
        <Button
          size="small"
          onClick={() => setExpanded(!expanded)}
          sx={{
            color: darkMode ? "#90caf9" : "#1976d2",
            mt: 0.5,
            textTransform: "none",
            fontSize: "0.9rem",
            padding: 0,
            "&:hover": {
              backgroundColor: "transparent",
              textDecoration: "underline",
            },
          }}
        >
          {expanded ? "Ver menos" : "Ver más"}
        </Button>
      )}
    </>
  );
};

export default Comment;
