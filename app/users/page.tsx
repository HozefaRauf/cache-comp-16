import { cacheLife } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";

type User = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  gender: string;
};

// Separate component just for the count
async function UserCount() {
  'use cache'
  cacheLife('minutes');
  
  console.log('🔴 [UserCount] Cache MISS - Fetching from API');
  
  const response = await fetch('https://dummyjson.com/users?limit=100');
  const data = await response.json();
  const fetchTime = new Date().toLocaleTimeString();
  
  return (
    <span>
      {data.users.length} 
      <span className="text-sm text-gray-500 ml-2">(fetched at {fetchTime})</span>
    </span>
  );
}

async function FetchUsers() {
  'use cache'
  cacheLife('seconds');
  
  console.log('🔴 [FetchUsers] Cache MISS - Fetching from API');
  
  const response = await fetch('https://dummyjson.com/users?limit=100');
  const data = await response.json();
  const users: User[] = data.users;
  const fetchTime = new Date().toLocaleTimeString();
  
  return (
    <>
      <p className="text-center text-sm text-gray-500 mb-4">
        Cards fetched at: {fetchTime}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {users.map((user) => (
        <Link href={`/users/${user.id}`} key={user.id}>
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-center w-16 h-16 bg-blue-500 text-white rounded-full mx-auto mb-4 text-2xl font-bold">
              {user.firstName.charAt(0)}
            </div>
            <h2 className="text-xl font-semibold text-center mb-2">
              {user.firstName} {user.lastName}
            </h2>
            <p className="text-gray-600 text-center mb-1">
              {user.email}
            </p>
            <p className="text-blue-500 text-center font-medium">
              {user.gender}
            </p>
          </div>
        </Link>
      ))}
      </div>
    </>
  );
}

export default function UsersPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-center">
        Users List
      </h1>
      
      <h2 className="text-2xl font-semibold mb-6 text-center">
        Total Users: {" "}
        <Suspense fallback={<span>Loading users...</span>}>
          <UserCount />
        </Suspense>
      </h2>
      
      <Suspense fallback={<div className="text-center">Loading user cards...</div>}>
        <FetchUsers />
      </Suspense>
    </div>
  );
}