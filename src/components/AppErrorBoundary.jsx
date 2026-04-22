import React from 'react';
import { getRecoveryLabel, getRecoveryPath } from '../utils/appShell';

export default class AppErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Application route crashed:', error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    handleGoHome = () => {
        window.location.href = getRecoveryPath(window.location.pathname);
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const recoveryLabel = getRecoveryLabel(window.location.pathname);

        return (
            <div className="myth-shell flex min-h-screen items-center justify-center bg-[#080705] px-4 text-white">
                <div className="command-panel w-full max-w-2xl rounded-[2rem] p-8">
                    <p className="legendary-title text-[11px] text-[var(--myth-cyan)]">Enterprise Recovery</p>
                    <h1 className="mt-3 text-4xl text-white">This workspace hit an unexpected error</h1>
                    <p className="mt-4 text-sm leading-relaxed text-[var(--myth-muted)]">
                        The app kept the shell alive so the session does not fail silently. You can reload the current release or return to the home login safely.
                    </p>

                    {this.state.error?.message && (
                        <div className="mt-5 rounded-[1.25rem] border border-[rgba(242,201,120,0.12)] bg-[rgba(10,8,6,0.78)] p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--myth-gold)]">Captured Error</p>
                            <p className="mt-2 break-words text-sm text-[var(--myth-muted)]">{this.state.error.message}</p>
                        </div>
                    )}

                    <div className="mt-6 flex flex-wrap gap-3">
                        <button type="button" onClick={this.handleReload} className="myth-button myth-button-primary rounded-2xl px-5 py-3 text-xs">
                            Reload Application
                        </button>
                        <button type="button" onClick={this.handleGoHome} className="myth-outline-button rounded-2xl px-5 py-3 text-xs">
                            {recoveryLabel}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
