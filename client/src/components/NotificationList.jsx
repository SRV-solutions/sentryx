const NotificationList = () => {
  const mockNotifications = [];

  return (
    <ul>
      {mockNotifications.length !== 0 ? mockNotifications.map((note, i) => (
        <li style={{ marginLeft: '1rem' }} key={i}>{note}</li>
      )) : 'Sin Notificaciones'}
    </ul>
  );
};

export default NotificationList;
