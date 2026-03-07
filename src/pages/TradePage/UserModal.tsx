import { useState, useEffect, useRef } from 'react';
import { UserIcon, DiscordIcon, LinkIcon, CheckIcon, CrossIcon } from './icons';
import styles from './UserModal.module.css';

export type UserData = {
  id: string;
  nickname: string;
  discordNickname: string;
  accountLink: string;
};

type Props = {
  user: UserData | null;
  onSave: (data: Omit<UserData, 'id'>) => void;
  onClose: () => void;
};

const UserModal = ({ user, onSave, onClose }: Props) => {
  const [nickname, setNickname] = useState('');
  const [discordNickname, setDiscordNickname] = useState('');
  const [accountLink, setAccountLink] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      setNickname(user.nickname);
      setDiscordNickname(user.discordNickname);
      setAccountLink(user.accountLink);
    } else {
      setNickname('');
      setDiscordNickname('');
      setAccountLink('');
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleSubmit = () => {
    const trimmedNick = nickname.trim();
    if (!trimmedNick) return;
    onSave({
      nickname: trimmedNick,
      discordNickname: discordNickname.trim(),
      accountLink: accountLink.trim(),
    });
    onClose();
  };

  const isCreate = user === null;

  return (
    <div className={styles.overlay}>
      <div ref={modalRef} className={styles.modal}>
        <div className={styles.title}>
          {isCreate ? 'Новый игрок' : 'Редактировать игрока'}
        </div>
        <div className={styles.fields}>
          <div className={styles.field}>
            <UserIcon className={styles.fieldIcon} />
            <input
              type="text"
              className={styles.input}
              placeholder="Никнейм"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <DiscordIcon className={styles.fieldIcon} />
            <input
              type="text"
              className={styles.input}
              placeholder="Никнейм в Discord"
              value={discordNickname}
              onChange={(e) => setDiscordNickname(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <LinkIcon className={styles.fieldIcon} />
            <input
              type="text"
              className={styles.input}
              placeholder="Ссылка на аккаунт"
              value={accountLink}
              onChange={(e) => setAccountLink(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnSave} onClick={handleSubmit}>
            <CheckIcon />
            Сохранить
          </button>
          <button type="button" className={styles.btnCancel} onClick={onClose}>
            <CrossIcon />
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserModal;
