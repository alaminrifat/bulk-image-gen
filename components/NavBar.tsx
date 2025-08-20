import Link from "next/link";

export default function NavBar() {
  return (
    <nav className="w-full bg-gray-100 border-b mb-6 py-3 px-4 flex gap-4 items-center">
      <Link href="/" className="font-semibold hover:underline">Together Batch</Link>
      <Link href="/imagen" className="font-semibold hover:underline">Imagen Batch</Link>
    </nav>
  );
}
