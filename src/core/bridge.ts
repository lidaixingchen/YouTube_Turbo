export interface RuntimeChannelOptions {
  readonly eventName: string;
  readonly receive: (value: unknown) => void;
  readonly onHandlerError: (error: unknown) => void;
}

export interface RuntimeChannel<T> {
  post(value: T): void;
  close(): void;
}

class RuntimeChannelImpl<T> implements RuntimeChannel<T> {
  private readonly eventName: string;
  private readonly receiveCallback: (value: unknown) => void;
  private readonly errorHandler: (error: unknown) => void;
  private readonly eventListener: (event: Event) => void;
  private isClosed: boolean = false;

  constructor(options: RuntimeChannelOptions) {
    this.eventName = options.eventName;
    this.receiveCallback = options.receive;
    this.errorHandler = options.onHandlerError;

    this.eventListener = (event: Event): void => {
      if (this.isClosed) {
        return;
      }
      const customEvent = event as CustomEvent<unknown>;
      if (!customEvent || customEvent.detail === undefined) {
        return;
      }
      try {
        this.receiveCallback(customEvent.detail);
      } catch (err: unknown) {
        try {
          this.errorHandler(err);
        } catch {
          // isolate error handler exceptions
        }
      }
    };

    window.addEventListener(this.eventName, this.eventListener);
  }

  public post(value: T): void {
    if (this.isClosed) {
      return;
    }
    const event = new CustomEvent(this.eventName, {
      detail: value,
      bubbles: false,
      cancelable: false,
      composed: false
    });
    window.dispatchEvent(event);
  }

  public close(): void {
    if (this.isClosed) {
      return;
    }
    this.isClosed = true;
    window.removeEventListener(this.eventName, this.eventListener);
  }
}

export function createRuntimeChannel<T>(
  options: RuntimeChannelOptions
): RuntimeChannel<T> {
  return new RuntimeChannelImpl<T>(options);
}

