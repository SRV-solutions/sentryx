export enum Action {
    CREATE = 'create',
    READ = 'read',
    UPDATE = 'update',
    DELETE = 'delete'
  }
  
  export enum Entity {
    USERS = 'users',
    ROLES = 'roles',
    PERMISSIONS = 'permissions',
    COURSES = 'courses',
    LESSONS = 'lessons',
    CHATS = 'chats'
  }
  
export enum ChatType {
  PRIVATE = 'PRIVATE',
  GROUP = 'GROUP',
  AI = 'AI', // ← Este es clave
}
  // que un usuario 