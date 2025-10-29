import { cacheLife } from "next/cache";

export default async function UserPage({ params }: { params: Promise<{ slug: string }> }) {
    'use cache'
    cacheLife('minutes');
    
    const { slug } = await params;
    const response = await fetch(`https://dummyjson.com/users/${slug}`);
    const user = await response.json();

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold mb-4">User Details</h1>
            <div className="bg-white rounded-lg shadow-md p-6">
                <p className="mb-2"><strong>ID:</strong> {user.id}</p>
                <p className="mb-2"><strong>Name:</strong> {user.firstName} {user.lastName}</p>
                <p className="mb-2"><strong>Email:</strong> {user.email}</p>
                <p className="mb-2"><strong>Gender:</strong> {user.gender}</p>
            </div>
        </div>
    );
}