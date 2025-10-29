import { cacheLife } from "next/cache";

export default async function UserPage({ params }: { params: { slug: string } }) {
    'use cache'
    cacheLife('minutes');

    const { slug } = params;
    // Ensure this fetch is cacheable during prerender to avoid blocking outside of <Suspense>
    const response = await fetch(`https://dummyjson.com/users/${slug}` , { next: { revalidate: 60 } });
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