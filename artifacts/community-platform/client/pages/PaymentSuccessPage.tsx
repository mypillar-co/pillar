import { Link } from "wouter";
import { useConfig } from "../config-context";

export default function PaymentSuccessPage() {
  const config = useConfig();
  const params = new URLSearchParams(window.location.search);
  const confirmation = params.get("confirmation");

  return (
    <div className="max-w-lg mx-auto px-4 py-24 text-center">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
        <span className="text-3xl">🎉</span>
      </div>
      <h1 className="text-3xl font-bold font-serif mb-3">You're In!</h1>
      <p className="text-gray-500 mb-4">Your ticket purchase was successful. See you there!</p>
      {confirmation && (
        <div className="p-4 bg-gray-50 rounded-lg mb-6 text-sm">
          <p className="text-gray-400 text-xs mb-1">Confirmation Number</p>
          <p className="font-mono font-bold text-gray-700">{confirmation}</p>
        </div>
      )}
      <p className="text-sm text-gray-400 mb-8">A confirmation email will be sent to your inbox shortly.</p>
      <Link href="/events">
        <button className="px-6 py-3 text-white rounded-md font-medium" style={{ backgroundColor: "var(--primary-hex)" }}>
          View More Events
        </button>
      </Link>
    </div>
  );
}
