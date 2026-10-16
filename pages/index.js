import { getRole } from '../lib/session';

export async function getServerSideProps({ req }) {
  const role = getRole(req);
  const destination = role === 'admin' ? '/admin' : role === 'staff' ? '/scan' : '/login';
  return { redirect: { destination, permanent: false } };
}

export default function Home() { return null; }
