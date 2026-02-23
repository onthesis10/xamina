// Custom hook — exam session dengan WS + timer
export function useExamSession(examId: string) {
  const { setTimer } = useExamStore();
  const socket = useSocket();

  // Server state via TanStack Query
  const { data: session } = useQuery({
    queryKey: ['exam-session', examId],
    queryFn: () => startExamSession(examId),
    staleTime: Infinity,
  });

  // Submit jawaban — optimistic update
  const submitAnswer = useMutation({
    mutationFn: examApi.submitAnswer,
    onMutate: async (vars) => {
      // Langsung update UI sebelum server response
      queryClient.setQueryData(
        ['exam-session', examId],
        (old) => ({
          ...old,
          answers: {
            ...old?.answers,
            [vars.questionId]: vars.answerId,
          }
        })
      );
    },
  });

  // WebSocket — real-time timer sync
  useEffect(() => {
    socket.on('timer:tick', setTimer);
    socket.on('exam:force-submit', () => {
      handleForceSubmit();
    });
    return () => socket.off('timer:tick');
  }, [socket]);

  return { session, submitAnswer };
}
