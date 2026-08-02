import Image from "next/image";
import { DemoRoom } from "./DemoRoom";
import logo from "./logo.png";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <DemoRoom />
      </main>
      <h1 className={styles.brandMark}>
        <Image src={logo} alt="weavo" className={styles.logo} priority />
      </h1>
    </div>
  );
}
