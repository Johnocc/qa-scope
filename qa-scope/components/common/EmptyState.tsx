export default function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center text-gray-500 py-16 text-sm">{message}</div>
  );
}
