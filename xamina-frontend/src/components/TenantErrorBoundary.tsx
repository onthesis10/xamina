import React, { Component, ReactNode } from "react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    errorStr?: string;
}

export class TenantErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, errorStr: error.message };
    }

    public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Tenant Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center p-xl h-full w-full">
                    <div className="stack gap-sm text-center card">
                        <h1 className="text-xl font-bold text-red-500">Terjadi Kesalahan Aplikasi</h1>
                        <p className="text-dimmed">Ada komponen yang gagal dimuat dalam tenant Anda.</p>
                        {this.state.errorStr && (
                            <div className="p-sm bg-gray-100 rounded text-xs text-left" style={{ overflow: "auto" }}>
                                <code>{this.state.errorStr}</code>
                            </div>
                        )}
                        <button
                            className="btn btn-primary mt-sm"
                            onClick={() => {
                                this.setState({ hasError: false, errorStr: undefined });
                                window.location.reload();
                            }}
                        >
                            Muat Ulang Halaman
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
