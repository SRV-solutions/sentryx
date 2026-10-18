import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../config/database';
import User from './User';

class Friendship extends Model {
  public id!: number;
  public requesterId!: number;  // Quien envía la solicitud
  public receiverId!: number;   // Quien la recibe
  public status!: string;       // Estado de la relación

  public static associate() {
    // Cada amistad tiene un usuario que solicitó
    Friendship.belongsTo(User, { foreignKey: 'requesterId', as: 'requester' });
    // Y un usuario receptor de la solicitud
    Friendship.belongsTo(User, { foreignKey: 'receiverId', as: 'receiver' });
  }
}

Friendship.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    requesterId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'User',
        key: 'id',
      },
    },
    receiverId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'User',
        key: 'id',
      },
    },
    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'rejected', 'blocked', 'cancelled', 'removed'),
      allowNull: false,
      defaultValue: 'pending',
    },
  },
  {
    sequelize,
    modelName: 'Friendship',
    tableName: 'Friendship',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['requesterId', 'receiverId'],
      },
    ],
  }
);

export default Friendship;
