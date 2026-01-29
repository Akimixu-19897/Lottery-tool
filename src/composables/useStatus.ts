import { ref } from 'vue'

export function useStatus() {
  const statusMessage = ref<string>('')

  function setStatus(message: string) {
    statusMessage.value = message
    window.setTimeout(() => {
      if (statusMessage.value === message) statusMessage.value = ''
    }, 5000)
  }

  return { statusMessage, setStatus }
}

