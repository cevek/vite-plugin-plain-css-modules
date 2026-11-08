const CSS_MODULE_SUFFIX = /\.module\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/i;

export function modulePath(filename: string): string {
    return filename.replace(/[?#].*$/, '').replace(/\\/g, '/');
}


/**
 * `Card.module.scss` → `Card`. Characters a class selector cannot hold collapse into `_`
 * (TanStack route files such as `patients_.$id`); a leading digit gets a `_` in front.
 */
export function classPrefix(filename: string): string {
    const base = modulePath(filename).split('/').pop()!.replace(CSS_MODULE_SUFFIX, '');
    const prefix = base.replace(/[^A-Za-z0-9_-]+/g, '_');
    return /^-?\d/.test(prefix) ? `_${prefix}` : prefix;
}

export function scopedName(local: string, filename: string): string {
    return `${classPrefix(filename)}_${local}`;
}
