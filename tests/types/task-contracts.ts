import {
  taskCreateContract,
  taskUpdateContract,
  type CreateTaskCommand,
  type TaskCreateContractInput,
  type TaskCreateContractOutput,
  type TaskCreateInputShape,
  type TaskUpdateContractInput,
  type TaskUpdateContractOutput,
  type UpdateTaskCommand,
  type UpdateTaskPayload,
} from "../../lib/task-contracts";

type Equal<T, U> =
  (<V>() => V extends T ? 1 : 2) extends
  (<V>() => V extends U ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

export type ContractInference = [
  Assert<Equal<TaskCreateContractInput, TaskCreateInputShape>>,
  Assert<Equal<TaskUpdateContractInput, UpdateTaskPayload>>,
  Assert<Equal<TaskCreateContractOutput, CreateTaskCommand>>,
  Assert<Equal<TaskUpdateContractOutput, UpdateTaskCommand>>,
];

const rawCreate: unknown = { title: "Valid task", label: 123 };
if (taskCreateContract.is(rawCreate)) {
  // @ts-expect-error Acceptance does not narrow legacy raw input to its declared shape.
  const declaredInput: TaskCreateContractInput = rawCreate;
  void declaredInput;
}

const rawUpdate: unknown = { labels: 123 };
if (taskUpdateContract.is(rawUpdate)) {
  // @ts-expect-error Acceptance does not narrow legacy raw input to its declared shape.
  const declaredInput: TaskUpdateContractInput = rawUpdate;
  void declaredInput;
}

const parsedCreate = taskCreateContract.parse(rawCreate);
if (parsedCreate.ok) {
  const command: CreateTaskCommand = parsedCreate.data;
  void command;
}

const parsedUpdate = taskUpdateContract.parse(rawUpdate);
if (parsedUpdate.ok) {
  const command: UpdateTaskCommand = parsedUpdate.data;
  void command;
}
