import { Link } from 'react-router-dom';
import styles from './StubPage.module.css';

const StubPage = () => {
  return (
    <div className={styles.root}>
      <span className={styles.text}>привет</span>
      <Link to="/trade" className={styles.link}>
        К таблице обмена
      </Link>
    </div>
  );
};

export default StubPage;

