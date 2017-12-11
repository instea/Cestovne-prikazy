import { INITIAL_STATE } from './../state/root';
import { StoreModule, Store, Action } from '@ngrx/store';
import { set, merge } from 'lodash'

export function mockStoreModule() {
    const routerDefinitions = Object.keys(INITIAL_STATE).reduce((def, key) => Object.assign(def, { [key]: mockReducer(key) }), {})
    return StoreModule.provideStore(routerDefinitions, INITIAL_STATE)
}

const UPDATE_STATE = "UPDATE_STATE"

function mockReducer(key: string) {
    return function mockedReducer(state, action: Action) {
        if (action.type === UPDATE_STATE) {
            let { path, value } = action.payload
            if (path.startsWith(key + '.')) {
                path = path.substr(key.length + 1);
                console.log('setting', path, value);
                const change = set({}, path, value)
                return merge({}, state, change)
            }
        }
        return state
    }
}

export function mockState(store: Store<any>, path: string, value: any) {
    store.dispatch({ type: UPDATE_STATE, payload: { path, value } })
}