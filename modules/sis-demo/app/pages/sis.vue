<template>
  <main class="mx-auto max-w-4xl p-8">
    <h1 class="text-2xl font-semibold">
      SIS Demo
    </h1>
    <p class="mt-2 text-gray-600">
      Students visible to the current teacher, resolved from TeacherAssignment.
    </p>

    <div class="mt-6 flex gap-2">
      <UInput
        v-model="query"
        placeholder="Search name or student no"
        class="flex-1"
        @keyup.enter="refresh"
      />
      <UButton @click="refresh">
        Search
      </UButton>
    </div>

    <p
      v-if="error"
      class="mt-4 text-red-600"
    >
      {{ error.message }}
    </p>

    <table
      v-else
      class="mt-6 w-full border-collapse text-sm"
    >
      <thead>
        <tr class="border-b text-left">
          <th class="py-2">
            Name
          </th>
          <th class="py-2">
            Student No
          </th>
          <th class="py-2">
            Class
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="student in students"
          :key="student.id"
          class="border-b"
        >
          <td class="py-2">
            {{ student.name }}
          </td>
          <td class="py-2">
            {{ student.studentNo }}
          </td>
          <td class="py-2">
            {{ student.classId }}
          </td>
        </tr>
        <tr v-if="students.length === 0">
          <td
            colspan="3"
            class="py-4 text-gray-500"
          >
            No students visible.
          </td>
        </tr>
      </tbody>
    </table>
  </main>
</template>

<script setup lang="ts">
interface Student {
  id: number
  name: string
  studentNo: string
  classId: number | null
}

const query = ref('')
const { data, refresh, error } = await useFetch<Student[]>('/api/modules/sis-demo/students', {
  query: { q: query }
})
const students = computed(() => data.value ?? [])
</script>
