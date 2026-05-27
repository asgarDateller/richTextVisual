declare module "quill" {
    interface QuillOptions {
        theme?: string;
        placeholder?: string;
        readOnly?: boolean;
        modules?: {
            toolbar?: any;
            [key: string]: any;
        };
        [key: string]: any;
    }

    class Quill {
        root: HTMLElement;
        constructor(container: Element | string, options?: QuillOptions);
        getText(index?: number, length?: number): string;
        focus(): void;
        blur(): void;
        enable(value?: boolean): void;
        hasFocus(): boolean;
        on(eventName: string, handler: (...args: any[]) => void): this;
    }

    export = Quill;
}
