const NotificationList = () => {
  const mockNotifications = [
    'Entrega de trabajo práctico el viernes.',
    'Examen de matemática el lunes.',
    'Reunión de padres el miércoles.',
  ];

  return (
    <ul>
      {mockNotifications.map((note, i) => (
        <li key={i}>{note}</li>
      ))}
    </ul>
  );
};

export default NotificationList;
