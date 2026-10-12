import styles from "./CatalogNote.module.css";

export function CatalogNote({ children, page = false }: { children: string; page?: boolean }) {
  return <p className={page ? styles.page : styles.note}>{children}</p>;
}
