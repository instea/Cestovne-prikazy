import { INITIAL_STATE } from './../state/root';
import { StoreModule } from '@ngrx/store';

export function mockStoreModule() {
    const routerDefinitions = Object.keys(INITIAL_STATE).reduce((def, key) => Object.assign(def, { key: mockReducer }), {})
    return StoreModule.provideStore(routerDefinitions, INITIAL_STATE)
}

function mockReducer(state) {
    return state
}